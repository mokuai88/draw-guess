// server.js —— 你画我猜 · 服务器权威版（阶段 1：完整回合玩法）
//
// 【架构】所有游戏规则由服务器判定（服务器权威），前端只负责显示和操作。
//   好处：两端状态永远一致、以后防作弊、易发布到公网。
//
// 【玩法】
//   1. 房间满 2 人 → 自动开局
//   2. 每回合轮流当"画者"，另一位是"猜者"
//   3. 服务器给画者发题目，给猜者发"准备猜"
//   4. 画者画（实时同步给猜者），猜者输入答案
//   5. 猜对 → 猜者 +1 分；超时则无分 → 交换角色进入下一回合
//   6. 打满 MAX_ROUNDS 回合 → 比分高者获胜
//
// 【消息协议】
//   客户端 -> 服务器：
//     {type:"join", room, name}          加入房间并报名
//     {type:"stroke", data:[点...]}      画者实时发出当前笔画
//     {type:"guess", text:"..."}         猜者提交答案
//   服务器 -> 客户端：
//     {type:"info", room, count}         人数变化
//     {type:"start", round, drawerIndex, scores, maxRounds, yourIndex}
//     {type:"newRound", round, drawerIndex, scores, maxRounds}
//     {type:"role", you:/drawer|guesser/, word}   这一回合你的身份（画者有 word）
//     {type:"result", correct, scores, round}     答对/超时的结果
//     {type:"stroke", data}              转发笔画给猜者
//     {type:"gameover", winnerIndex, scores}
//     {type:"pong"} / {type:"waiting"}             服务器确认

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_ROUNDS = 5;      // 一局打几回合
const ROUND_SECONDS = 45;  // 每回合限时

// ---------- 题库（按难度分档）----------
// 简单：日常物品 / 动植物 / 基础图形，好画好猜
const WORDS_EASY = [
  '苹果','香蕉','西瓜','葡萄','橙子','草莓','梨','桃子','柠檬','柿子',
  '胡萝卜','黄瓜','西红柿','南瓜','玉米','土豆','白菜','蘑菇','辣椒','大蒜',
  '猫','狗','兔子','鸟','鱼','乌龟','螃蟹','蝴蝶','蜜蜂','蚂蚁',
  '鲸鱼','鲨鱼','大象','老虎','狮子','猴子','熊猫','长颈鹿','袋鼠','老鼠',
  '太阳','月亮','星星','云','彩虹','雪','雨','闪电','风','山',
  '房子','门','窗户','桌子','椅子','床','沙发','灯','镜子','伞',
  '手机','电脑','电视','冰箱','空调','洗衣机','闹钟','耳机','眼镜','雨伞',
  '汽车','自行车','公交车','火车','飞机','轮船','摩托车','出租车','地铁','卡车',
  '蛋糕','冰淇淋','汉堡','披萨','面条','饺子','包子','寿司','糖葫芦','爆米花',
  '篮球','足球','羽毛球','乒乓球','网球','排球','棒球','保龄球','高尔夫','跳绳',
  '眼睛','鼻子','嘴巴','耳朵','手','脚','头','心脏','骨头','头发'
];
// 中等：简单动作 / 场景 / 职业 / 自然景观
const WORDS_MEDIUM = [
  '跑步','游泳','跳舞','唱歌','画画','看书','睡觉','吃饭','刷牙','洗澡',
  '打伞','扫地','拖地','洗衣服','做饭','买菜','上班','上学','旅行','露营',
  '医生','护士','老师','警察','消防员','厨师','司机','飞行员','宇航员','士兵',
  '沙滩','森林','沙漠','瀑布','火山','岛屿','草原','冰川','峡谷','洞穴',
  '城堡','宫殿','金字塔','长城','寺庙','灯塔','风车','摩天轮','秋千','滑梯',
  '手表','吉他','钢琴','小提琴','鼓','相机','望远镜','显微镜','指南针','地图',
  '老虎机','照相机','冰淇淋屋','太空船','潜水艇','热气球','降落伞','滑板','轮滑','滑雪板',
  '天鹅','孔雀','海豚','海豹','企鹅','鹦鹉','啄木鸟','萤火虫','瓢虫','蜻蜓',
  '高铁','磁悬浮','三明治','热狗','甜甜圈','布丁','果冻','珍珠奶茶','咖啡','牛奶',
  '婚礼','生日','新年','圣诞节','中秋节','吃粽子','放鞭炮','拜年','赏月','贴春联'
];
// 困难：抽象 / 情绪 / 成语 / 专业词汇，有挑战性
const WORDS_HARD = [
  '自由','幸福','梦想','希望','和平','勇气','智慧','信任','思念','体面',
  '一见钟情','趁热打铁','对牛弹琴','画蛇添足','亡羊补牢','守株待兔','井底之蛙','狐假虎威','掩耳盗铃','刻舟求剑',
  '地铁站','十字路口','红绿灯','斑马线','停车场','加油站','消防栓','电线杆','广告牌','路灯',
  '百叶窗','跷跷板','过山车','海盗船','鬼屋','水族馆','动物园','植物园','天文馆','斜塔',
  '埃菲尔铁塔','自由女神','凯旋门','故宫','兵马俑','天坛','布达拉宫','鸟巢','牌坊','风铃',
  '清明上河图','写作业','熬夜','加班','堵车','迷路','失业','搬家','装修','体检',
  '恐龙','鸵鸟','变色龙','壁虎','蜗牛','蚯蚓','珊瑚','海星','水母','海马'
];

const WORDS = WORDS_EASY.concat(WORDS_MEDIUM, WORDS_HARD);
// 每回合依序的难度档位（简单->中等->困难，越往后越难）
const EASY_COUNT = WORDS_EASY.length;
const MEDIUM_COUNT = WORDS_MEDIUM.length;
function wordForRound(round, maxRounds){
  // 前 40% 回合简单，中间 40% 中等，最后 20% 困难
  const ratio = (round-1) / Math.max(1, maxRounds);
  if (ratio < 0.4)  return WORDS_EASY[Math.floor(Math.random()*EASY_COUNT)];
  if (ratio < 0.8)  return WORDS_MEDIUM[Math.floor(Math.random()*MEDIUM_COUNT)];
  return WORDS_HARD[Math.floor(Math.random()*WORDS_HARD.length)];
}
function randWord(round, maxRounds){ return wordForRound(round, maxRounds); }

// ---------- 1. HTTP 托管前端静态文件 ----------
const server = http.createServer((req, res) => {
  let url = req.url;
  if (url === '/' || url === '') url = '/index.html';
  const filePath = path.join(__dirname, 'public', url);
  const ext = path.extname(filePath);
  const types = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
});

// ---------- 2. WebSocket ----------
const wss = new WebSocketServer({ server });
const rooms = new Map();   // room -> { players:[ws], scores:[n,n], round, drawerIndex, word, timer, maxRounds }

function send(ws, obj){ if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj){ const g=rooms.get(room); if(!g) return; g.players.forEach(ws=>send(ws,obj)); }
// 只发给下标为 idx 的那个玩家
function sendTo(room, idx, obj){ const g=rooms.get(room); if(g&&g.players[idx]) send(g.players[idx], obj); }

function roomScores(g){ return (g.scores||[]).map(s=>s||0); }

// 开始 / 进入下一回合
function nextRound(room, g, isFirst){
  if (g.round >= g.maxRounds) {   // 局已打完
    const w = g.scores[0] > g.scores[1] ? 0 : g.scores[1] > g.scores[0] ? 1 : -1;
    broadcast(room, { type:'gameover', winnerIndex:w, scores:g.scores.slice() });
    g.timer = null;
    return;
  }
  g.round = (g.round||0) + 1;
  g.drawerIndex = (g.round - 1) % 2;        // 奇数回合玩家0画，偶数回合玩家1画
  g.word = randWord(g.round, g.maxRounds);

  const base = { type:'newRound', round:g.round, drawerIndex:g.drawerIndex,
                 scores:g.scores.slice(), maxRounds:g.maxRounds };
  if (isFirst) base.type = 'start';
  broadcast(room, base);

  // 分别告知身份（画者能看到词，猜者看不到）
  g.players.forEach((ws, idx)=>{
    send(ws, { type:'role',
               you:(idx===g.drawerIndex?'drawer':'guesser'),
               word:(idx===g.drawerIndex? g.word : undefined) });
  });

  // 回合倒计时
  clearTimeout(g.timer);
  g.timer = setTimeout(()=>{
    broadcast(room, { type:'result', correct:false, scores:g.scores.slice(), round:g.round, timeout:true });
    nextRound(room, g, false);
  }, ROUND_SECONDS * 1000);
}

// 无响应超时(秒)：超过这个时间没收到任何消息的玩家视为掉线，自动清理
const STALE_MS = 15000;

// 从房间移除一个玩家（close 与心跳清理共用）
function removePlayer(room, ws){
  const g = rooms.get(room);
  if (!g) return;
  clearTimeout(g.timer);
  g.players = g.players.filter(p => p !== ws);
  if (g.players.length === 1) send(g.players[0], { type:'peerLeft' });  // 只剩一人则提示
  broadcast(room, { type:'info', room, count:g.players.length, names:g.players.map(p=>p.name) });
  ws.room = null;
}

// 心跳清理：定时扫描，踢掉长时间无响应的玩家（应对断线未触发 close 的情况）
setInterval(() => {
  const now = Date.now();
  for (const [room, g] of rooms) {
    if (!g) continue;
    // 收集该房间里所有超时滞留在 players 里的"死连接"
    const stale = g.players.filter(p => now - (p.lastSeen || now) > STALE_MS);
    for (const ws of stale) {
      try { ws.close(); } catch (_) {}
      removePlayer(room, ws);
    }
    // 房间无玩家则清空房间定义，避免无限累积
    if (g.players.length === 0 && !g.timer) rooms.delete(room);
  }
}, 5000).unref();

wss.on('connection', (ws) => {
  ws.room = null;
  ws.name = '玩家';
  ws.lastSeen = Date.now();

  ws.on('message', (raw) => {
    ws.lastSeen = Date.now();   // 任何消息都视为仍在线
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      // 建房 / 登记
      if (!rooms.has(msg.room)) rooms.set(msg.room, {
        players:[], scores:[0,0], round:0, drawerIndex:0, word:null, timer:null, maxRounds:MAX_ROUNDS
      });
      const g = rooms.get(msg.room);
      if (!g.players.includes(ws)) {
        if (g.players.length >= 2) { send(ws, {type:'full'}); return; } // 只支持2人
        g.players.push(ws);
        ws.room = msg.room;
        if (msg.name) ws.name = String(msg.name).slice(0, 12);
        // 告诉自己下标
        send(ws, { type:'you', idx:g.players.indexOf(ws) });
      }
      broadcast(msg.room, { type:'info', room:msg.room, count:g.players.length,
                           names:g.players.map(p=>p.name) });
      // 两人齐了才开局
      if (g.players.length === 2) { nextRound(msg.room, g, true); }
      else if (g.players.length === 1) { send(ws, { type:'waiting' }); }
      return;
    }

    if (msg.type === 'stroke') {
      // 只转发"画者"的笔画给另一位；其他人控制的输入忽略
      if (!ws.room) return;
      const g = rooms.get(ws.room); if (!g) return;
      const idx = g.players.indexOf(ws);
      if (idx !== g.drawerIndex) return;         // 只有画者能画
      const other = g.players[1 - idx];
      if (other) send(other, { type:'stroke', data:msg.data });
      return;
    }

    if (msg.type === 'guess') {
      // 只有"猜者"能猜
      if (!ws.room) return;
      const g = rooms.get(ws.room); if (!g) return;
      const idx = g.players.indexOf(ws);
      if (idx === g.drawerIndex) return;         // 画者不能猜
      const text = String(msg.text||'').trim();
      if (!text) return;
      // 服务器权威判定
      const ok = text === g.word;
      if (ok) {
        clearTimeout(g.timer);
        g.scores[1 - g.drawerIndex] += 1;        // 猜者得分
        broadcast(ws.room, { type:'result', correct:true, scores:g.scores.slice(),
                             round:g.round, answer:g.word, text });
        nextRound(ws.room, g, false);
      } else {
        send(ws, { type:'wrong' });              // 猜错了，仅提醒本人
      }
      return;
    }

    if (msg.type === 'restart') {
      // 再来一局：重置比分和回合，立刻开始新局（也刷新房间广播的得分）
      if (!ws.room) return;
      const g = rooms.get(ws.room); if (!g) return;
      if (g.players.length < 2) { send(ws, { type:'waiting' }); return; }  // 只有一人不重开
      clearTimeout(g.timer);
      g.scores = [0, 0];
      g.round = 0;
      g.drawerIndex = 0;
      g.word = null;
      g.timer = null;
      nextRound(ws.room, g, true);   // 当作新开局广播（start）
      return;
    }

    if (msg.type === 'ping') { send(ws, { type:'pong' }); return; }
  });

  ws.on('close', () => {
    if (ws.room) removePlayer(ws.room, ws);
  });
});

server.listen(PORT, () => {
  console.log(`▶ 你画我猜 · 服务器已启动： http://localhost:${PORT}`);
  console.log(`  (Ctrl+C 停止)`);
});