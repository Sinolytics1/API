// index.js (Node.js 20.x)
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
let pool;

const CA_PATHS = [
  path.join(__dirname, 'rds_combined_ca_bundle.pem'), // 放进部署包根目录        
];

function readFirstExisting(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return readPem(p);
  }
  throw new Error('CA bundle not found at: ' + paths.join(', '));
}

function readPem(p) {
  return fs.readFileSync(p, 'utf8');
}

function cfg() {
  return {
    host: process.env.DB_HOST,
    port: +(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,   // database_report
    user: process.env.DB_USER,       // api_reader
    password: process.env.DB_PASS,
    ssl: { 
      rejectUnauthorized: true,
      ca: readFirstExisting(CA_PATHS),   
      servername: process.env.DB_HOST,
    }, // TODO: 上线改为 true 并配置 CA
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  };
}

function getPool() {
  if (!pool) pool = new Pool(cfg());
  return pool;
}

// 把 "a; b; c" → ["a","b","c"]（空字符串→[]）
function splitList(s) {
  if (!s) return [];
  const arr = s.split(';').map(x => x.trim()).filter(Boolean);
  return Array.from(new Set(arr)); // 去重保险
}


exports.handler = async (event) => {
  console.log('raw event =', JSON.stringify(event));
  console.log('qsp =', JSON.stringify(event?.queryStringParameters));
  const q = event?.queryStringParameters ?? {};
  const limit  = Math.min(Math.max(parseInt(q.limit ?? '5', 10), 1), 5);
  const offset = Math.max(parseInt(q.offset ?? '0',   10), 0);

  const sql = `
    SELECT DISTINCT
  v.id,
  v.title,
  v.author,
  v.publisher,
  (date(v.last_edited_at)) AS last_edited_date,
  v.channel,
  v.tag,
  v.country,
  v.key_takeaways,
  v.content
FROM v_topics_export_final v
JOIN topicchannel tc ON tc.topic_id = v.id
JOIN clientchannel cc ON cc.channel_id = tc.channel_id
WHERE cc.client_id = '52ca7a3f-0eba-4284-9537-12d0f30ce754'
  AND cc.valid_until >= CURRENT_DATE
ORDER BY last_edited_date DESC NULLS LAST, id DESC
LIMIT $1 OFFSET $2;

  `;

  const p = getPool();
  const { rows } = await p.query(sql, [limit, offset]);

  // 映射为JSON（把分号串转数组）
  const topics = rows.map(r => ({
    id: r.id,
    title: r.title,
    authors: splitList(r.author),          
    publisher: r.publisher,      // "Geolytics"
    last_edited_date: r.last_edited_date, // "YYYY-MM-DD"
    channels: splitList(r.channel),
    tags: splitList(r.tag),
    countries: splitList(r.country),
    key_takeaways: r.key_takeaways ?? null,
    content: r.content,
  }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',                 // 需要可改为白名单域名
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=30',
    },

    body: JSON.stringify({
    meta: {
      publisher: "Geolytics",
      exported_at: new Date().toISOString().substring(0,10),
      limit,
      offset},
    topics
    })
  };
};
