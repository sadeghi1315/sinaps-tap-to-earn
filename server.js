const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const PORT = process.env.PORT || 10000;
const DB_URL = process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TREASURY_WALLET = process.env.TREASURY_WALLET || 'UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX';
const SNP_CONTRACT = 'EQAmLlerUViNn9PwFVRlR_AjDvhd5pkmeLNOu5bNDpvXV0ls';
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || '';
const TONCENTER = 'https://toncenter.com/api/v3';
const FEE_NANO = '100000000';
const REFERRAL_RATE = 0.15;
const TASKS = {
  channel: { id:'channel', title:'Join SINAPS Channel', reward:100, url:'https://t.me/SINAPS_COIN', chat:'@SINAPS_COIN' },
  group: { id:'group', title:'Join SINAPS Group', reward:70, url:'https://t.me/SINAPS_Group', chat:'@SINAPS_Group' },
  twitter: { id:'twitter', title:'Follow SINAPS on X', reward:50, url:'https://x.com/SINAPS_SNP' },
  holder: { id:'holder', title:'Hold 50,000 SNP', reward:1000, threshold:50000 }
};
if (!DB_URL || !DB_TOKEN) throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });

function tgId(v){ const n=Number(v); return Number.isSafeInteger(n)&&n>0?n:null; }
function amount(v){ const n=Number(v); return Number.isSafeInteger(n)&&n>0?n:null; }
function now(){ return new Date().toISOString(); }
function code(){ return 'SNP-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
function json(res,status,data){ return res.status(status).json(data); }

async function init(){
 await db.execute(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER NOT NULL UNIQUE, username TEXT DEFAULT '', balance INTEGER NOT NULL DEFAULT 0, energy INTEGER NOT NULL DEFAULT 1000, max_energy INTEGER NOT NULL DEFAULT 1000, last_energy_update TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_daily_bonus TEXT, wallet_address TEXT, referral_code TEXT UNIQUE, referred_by INTEGER, referral_count INTEGER NOT NULL DEFAULT 0)`);
 const alters = [
  `ALTER TABLE users ADD COLUMN referral_code TEXT`, `ALTER TABLE users ADD COLUMN referred_by INTEGER`, `ALTER TABLE users ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN referral_remainder REAL NOT NULL DEFAULT 0`
 ];
 for(const q of alters){ try{ await db.execute(q); }catch(e){} }
 await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code)`);
 await db.execute(`CREATE TABLE IF NOT EXISTS task_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER NOT NULL, task_id TEXT NOT NULL, reward INTEGER NOT NULL, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(telegram_id,task_id))`);
 await db.execute(`CREATE TABLE IF NOT EXISTS daily_rewards (telegram_id INTEGER PRIMARY KEY, streak INTEGER NOT NULL DEFAULT 0, last_claim_date TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await db.execute(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id INTEGER NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'completed', description TEXT DEFAULT '', metadata TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 await db.execute(`CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY AUTOINCREMENT, withdrawal_id TEXT NOT NULL UNIQUE, telegram_id INTEGER NOT NULL, wallet_address TEXT NOT NULL, amount INTEGER NOT NULL, fee_ton REAL NOT NULL DEFAULT 0.1, fee_nano TEXT NOT NULL DEFAULT '100000000', treasury_wallet TEXT NOT NULL, token_contract TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'payment_pending', fee_tx_hash TEXT, payout_tx_hash TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, verified_at TEXT, completed_at TEXT)`);
 console.log('Database initialized');
}

function validateInitData(initData){
 if(!BOT_TOKEN || !initData) return null;
 const p=new URLSearchParams(initData); const hash=p.get('hash'); if(!hash)return null; p.delete('hash');
 const dataCheck=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
 const expected=crypto.createHmac('sha256',secret).update(dataCheck).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(hash))) return null;
 const authDate=Number(p.get('auth_date')||0); if(!authDate || Date.now()/1000-authDate>86400) return null;
 try{return JSON.parse(p.get('user')||'{}');}catch{return null;}
}
async function auth(req,res){
 const rawInit = String(req.body?.init_data || req.headers['x-telegram-init-data'] || '');
 const initUser=validateInitData(rawInit);
 const supplied=tgId(req.body.telegram_id);
 if(!initUser || !tgId(initUser.id) || (supplied && supplied!==tgId(initUser.id))) { json(res,401,{error:'Telegram session verification failed'}); return null; }
 return tgId(initUser.id);
}
async function ensureUser(id, username='', referredBy=null){
 let r=await db.execute({sql:'SELECT * FROM users WHERE telegram_id=? LIMIT 1',args:[id]});
 if(!r.rows.length){
  let ref=null;
  if(referredBy && referredBy!==id){ const rr=await db.execute({sql:'SELECT telegram_id FROM users WHERE referral_code=? LIMIT 1',args:[String(referredBy)]}); if(rr.rows.length) ref=Number(rr.rows[0].telegram_id); }
  const rc=code(); await db.execute({sql:`INSERT INTO users(telegram_id,username,balance,energy,max_energy,last_energy_update,referral_code,referred_by,referral_count,referral_remainder) VALUES(?,?,0,1000,1000,?,?,?,0,0)`,args:[id,username,now(),rc,ref]});
  if(ref){ await db.execute({sql:'UPDATE users SET referral_count=referral_count+1 WHERE telegram_id=?',args:[ref]}); await credit(ref,100,'referral','New friend joined',false); }
 } else if(username) await db.execute({sql:'UPDATE users SET username=? WHERE telegram_id=?',args:[username,id]});
 r=await db.execute({sql:'SELECT * FROM users WHERE telegram_id=? LIMIT 1',args:[id]}); return r.rows[0];
}
async function tx(id,type,amt,status='completed',description='',metadata={}){ await db.execute({sql:`INSERT INTO transactions(telegram_id,type,amount,status,description,metadata) VALUES(?,?,?,?,?,?)`,args:[id,type,amt,status,description,JSON.stringify(metadata)]}); }
async function credit(id,amt,type,description,applyReferral=true){
 await db.execute({sql:'UPDATE users SET balance=balance+? WHERE telegram_id=?',args:[amt,id]});
 await tx(id,type,amt,'completed',description);
 if(applyReferral){ const r=await db.execute({sql:'SELECT referred_by FROM users WHERE telegram_id=?',args:[id]}); const ref=r.rows[0]?.referred_by; if(ref){ const rr=await db.execute({sql:'SELECT referral_remainder FROM users WHERE telegram_id=?',args:[ref]}); const total=amt*REFERRAL_RATE+Number(rr.rows[0]?.referral_remainder||0); const bonus=Math.floor(total); await db.execute({sql:'UPDATE users SET referral_remainder=? WHERE telegram_id=?',args:[total-bonus,ref]}); if(bonus>0){ await db.execute({sql:'UPDATE users SET balance=balance+? WHERE telegram_id=?',args:[bonus,ref]}); await tx(ref,'referral_commission',bonus,'completed',`15% from referral ${id}`); } } }
}
async function userRow(id){ const r=await db.execute({sql:'SELECT * FROM users WHERE telegram_id=? LIMIT 1',args:[id]}); return r.rows[0]; }

app.get('/',(req,res)=>res.json({ok:true,service:'SINAPS backend',status:'online',features:['tasks','daily','referrals','history','holder-check']}));

app.post('/api/user',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const u=await ensureUser(id,String(req.body.username||''),req.body.start_param||null);res.json({ok:true,user:u});}catch(e){console.error(e);json(res,500,{error:'User request failed'});}});
app.post('/api/tap',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const u=await userRow(id);if(!u)return json(res,404,{error:'User not found'});if(Number(u.energy)<=0)return json(res,400,{error:'Not enough energy',user:u});await db.execute({sql:'UPDATE users SET balance=balance+1, energy=energy-1 WHERE telegram_id=? AND energy>0',args:[id]});await tx(id,'tap',1,'completed','Tap reward');const rr=await db.execute({sql:'SELECT referred_by FROM users WHERE telegram_id=?',args:[id]});const ref=rr.rows[0]?.referred_by;if(ref){const q=await db.execute({sql:'SELECT referral_remainder FROM users WHERE telegram_id=?',args:[ref]});const total=1*REFERRAL_RATE+Number(q.rows[0]?.referral_remainder||0);const bonus=Math.floor(total);await db.execute({sql:'UPDATE users SET referral_remainder=? WHERE telegram_id=?',args:[total-bonus,ref]});if(bonus>0){await db.execute({sql:'UPDATE users SET balance=balance+? WHERE telegram_id=?',args:[bonus,ref]});await tx(ref,'referral_commission',bonus,'completed',`15% commission from referral ${id}`);}}const updated=await userRow(id);res.json({ok:true,user:updated});}catch(e){console.error(e);json(res,500,{error:'Tap failed'});}});

app.post('/api/wallet/connect',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const a=String(req.body.wallet_address||'').trim();if(!a)return json(res,400,{error:'wallet_address required'});await db.execute({sql:'UPDATE users SET wallet_address=? WHERE telegram_id=?',args:[a,id]});res.json({ok:true,wallet_address:a});}catch(e){json(res,500,{error:'Wallet save failed'});}});
app.post('/api/wallet/get',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const u=await userRow(id);res.json({ok:true,wallet_address:u?.wallet_address||null});}catch(e){json(res,500,{error:'Wallet lookup failed'});}});
app.post('/api/wallet/disconnect',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;await db.execute({sql:'UPDATE users SET wallet_address=NULL WHERE telegram_id=?',args:[id]});res.json({ok:true});}catch(e){json(res,500,{error:'Wallet disconnect failed'});}});

app.get('/api/tasks',async(req,res)=>{res.json({ok:true,tasks:Object.values(TASKS).map(x=>({id:x.id,title:x.title,reward:x.reward,url:x.url||null}))});});
app.post('/api/tasks/claim',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const taskId=String(req.body.task_id||'');if(!TASKS[taskId])return json(res,400,{error:'Unknown task'});const already=await db.execute({sql:'SELECT id FROM task_claims WHERE telegram_id=? AND task_id=? LIMIT 1',args:[id,taskId]});if(already.rows.length)return json(res,400,{error:'Task already completed',already_completed:true});let verified=false,reason='';
 if(taskId==='channel'||taskId==='group'){
  if(!BOT_TOKEN)return json(res,500,{error:'Telegram verification is not configured'});
  const chat=TASKS[taskId].chat; const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(chat)}&user_id=${id}`);const d=await r.json();const s=d?.result?.status;verified=!!d.ok && ['member','administrator','creator'].includes(s);reason=verified?'':'You are not a member. Join and try again.';
 } else if(taskId==='holder'){
  const u=await userRow(id); if(!u?.wallet_address) reason='Connect your TON wallet first.'; else { const bal=await getJettonBalance(u.wallet_address); verified=bal>=50000; reason=verified?'':`Wallet holds ${bal.toLocaleString()} SNP; 50,000 SNP required.`; }
 } else if(taskId==='twitter') { reason='X follow verification requires an X API credential; task is temporarily unavailable.'; }
 if(!verified)return json(res,400,{error:reason||'Verification failed. Please try again.'});
 await db.execute({sql:'INSERT INTO task_claims(telegram_id,task_id,reward) VALUES(?,?,?)',args:[id,taskId,TASKS[taskId].reward]});await credit(id,TASKS[taskId].reward,'task_reward',TASKS[taskId].title,true);const u=await userRow(id);res.json({ok:true,task_id:taskId,reward:TASKS[taskId].reward,user:u});
 }catch(e){console.error('TASK',e);json(res,500,{error:'Task verification failed. Please try again.'});}});

app.get('/api/daily',async(req,res)=>{try{const id=tgId(req.query.telegram_id);if(!id)return json(res,400,{error:'Invalid telegram_id'});const r=await db.execute({sql:'SELECT * FROM daily_rewards WHERE telegram_id=?',args:[id]});res.json({ok:true,daily:r.rows[0]||{streak:0,last_claim_date:null}});}catch(e){json(res,500,{error:'Daily lookup failed'});}});
app.post('/api/daily/claim',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const today=new Date().toISOString().slice(0,10);let r=await db.execute({sql:'SELECT * FROM daily_rewards WHERE telegram_id=?',args:[id]});let row=r.rows[0];if(row?.last_claim_date===today)return json(res,400,{error:'Today already claimed'});let streak=1;if(row?.last_claim_date){const d=new Date(row.last_claim_date+'T00:00:00Z');const diff=Math.round((new Date(today+'T00:00:00Z')-d)/86400000);streak=diff===1?Math.min(30,Number(row.streak)+1):1;}const reward=streak*10;if(row)await db.execute({sql:'UPDATE daily_rewards SET streak=?,last_claim_date=?,updated_at=? WHERE telegram_id=?',args:[streak,today,now(),id]});else await db.execute({sql:'INSERT INTO daily_rewards(telegram_id,streak,last_claim_date) VALUES(?,?,?)',args:[id,streak,today]});await credit(id,reward,'daily_reward',`Day ${streak} daily reward`,true);const u=await userRow(id);res.json({ok:true,day:streak,reward,user:u});}catch(e){console.error(e);json(res,500,{error:'Daily claim failed'});}});

app.get('/api/friends',async(req,res)=>{try{const id=tgId(req.query.telegram_id);if(!id)return json(res,400,{error:'Invalid telegram_id'});const u=await userRow(id);const ref=await db.execute({sql:'SELECT telegram_id,username,balance,created_at FROM users WHERE referred_by=? ORDER BY created_at DESC',args:[id]});res.json({ok:true,referral_code:u?.referral_code||null,referral_count:ref.rows.length,friends:ref.rows.map(x=>({telegram_id:x.telegram_id,username:x.username||'User',balance:Number(x.balance||0),created_at:x.created_at}))});}catch(e){json(res,500,{error:'Friends lookup failed'});}});

app.get('/api/history',async(req,res)=>{try{const id=tgId(req.query.telegram_id);if(!id)return json(res,400,{error:'Invalid telegram_id'});const r=await db.execute({sql:'SELECT * FROM transactions WHERE telegram_id=? ORDER BY id DESC LIMIT 100',args:[id]});res.json({ok:true,transactions:r.rows});}catch(e){json(res,500,{error:'History lookup failed'});}});

async function getJettonBalance(owner){
 const url=new URL(TONCENTER+'/jetton/wallets');url.searchParams.set('jetton_address',SNP_CONTRACT);url.searchParams.set('owner_address',owner);url.searchParams.set('limit','10');url.searchParams.set('offset','0');
 const h={Accept:'application/json'};if(TONCENTER_API_KEY)h['X-API-Key']=TONCENTER_API_KEY;const r=await fetch(url,{headers:h});if(!r.ok)throw new Error('TON indexer error');const d=await r.json();const w=d.jetton_wallets?.[0];if(!w)return 0;const raw=BigInt(String(w.balance||'0'));return Number(raw/1000000000n);
}
app.post('/api/holder/check',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const u=await userRow(id);if(!u?.wallet_address)return json(res,400,{error:'Connect your wallet first'});const bal=await getJettonBalance(u.wallet_address);res.json({ok:true,balance:bal,qualified:bal>=50000});}catch(e){console.error(e);json(res,500,{error:'Could not verify SNP balance'});}});

app.post('/api/withdraw/create',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const wallet=String(req.body.wallet_address||'').trim();const amt=amount(req.body.amount);if(!wallet||!amt)return json(res,400,{error:'Invalid withdrawal data'});const u=await userRow(id);if(!u)return json(res,404,{error:'User not found'});if(u.wallet_address&&u.wallet_address!==wallet)return json(res,400,{error:'Wallet does not match saved wallet'});if(amt>Number(u.balance))return json(res,400,{error:'Insufficient SNP balance'});const pending=await db.execute({sql:`SELECT withdrawal_id FROM withdrawals WHERE telegram_id=? AND status IN('created','payment_pending','verified','processing') LIMIT 1`,args:[id]});if(pending.rows.length)return json(res,400,{error:'There is already a pending withdrawal',withdrawal_id:pending.rows[0].withdrawal_id});const wid='SNP-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();await db.execute({sql:`INSERT INTO withdrawals(withdrawal_id,telegram_id,wallet_address,amount,fee_ton,fee_nano,treasury_wallet,token_contract,status) VALUES(?,?,?, ?,0.1,?,?,?,'payment_pending')`,args:[wid,id,wallet,amt,FEE_NANO,TREASURY_WALLET,SNP_CONTRACT]});await tx(id,'withdrawal',-amt,'payment_pending',`Withdrawal ${wid}`);res.json({ok:true,withdrawal_id:wid,amount:amt,fee_ton:.1,fee_nano:FEE_NANO,treasury_wallet:TREASURY_WALLET,status:'payment_pending'});}catch(e){console.error(e);json(res,500,{error:'Withdrawal creation failed'});}});
app.get('/api/withdraw/status/:wid',async(req,res)=>{try{const r=await db.execute({sql:'SELECT * FROM withdrawals WHERE withdrawal_id=? LIMIT 1',args:[req.params.wid]});if(!r.rows.length)return json(res,404,{error:'Withdrawal not found'});res.json({ok:true,withdrawal:r.rows[0]});}catch(e){json(res,500,{error:'Withdrawal status failed'});}});
app.post('/api/withdraw/verify',async(req,res)=>{try{const id=await auth(req,res);if(!id)return;const wid=String(req.body.withdrawal_id||'');const wallet=String(req.body.wallet_address||'');const r=await db.execute({sql:'SELECT * FROM withdrawals WHERE withdrawal_id=? LIMIT 1',args:[wid]});if(!r.rows.length)return json(res,404,{error:'Withdrawal not found'});const w=r.rows[0];if(Number(w.telegram_id)!==id||w.wallet_address!==wallet)return json(res,403,{error:'Wallet/user mismatch'});res.json({ok:true,status:w.status,withdrawal:w});}catch(e){json(res,500,{error:'Withdrawal verification failed'});}});

app.listen(PORT,()=>console.log(`SINAPS backend running on port ${PORT}`));
init().catch(e=>{console.error('STARTUP ERROR',e);process.exit(1);});
