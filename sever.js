// ==================== server.js ====================
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const API_BASE = 'https://discord.com/api/v9';

// Build number cache
let cachedBuildNumber = 504649;

async function fetchBuildNumber() {
    try {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
        const r = await axios.get('https://discord.com/app', { headers: { 'User-Agent': ua }, timeout: 10000 });
        const scripts = r.data.match(/\/assets\/([a-f0-9]+)\.js/g) || [];
        for (const script of scripts.slice(-5)) {
            const hash = script.replace('/assets/', '').replace('.js', '');
            try {
                const ar = await axios.get(`https://discord.com/assets/${hash}.js`, { headers: { 'User-Agent': ua }, timeout: 10000 });
                const m = ar.data.match(/buildNumber["\s:]+["\s]*(\d{5,7})/);
                if (m) { cachedBuildNumber = parseInt(m[1]); return cachedBuildNumber; }
            } catch {}
        }
    } catch {}
    return cachedBuildNumber;
}

function makeSuperProperties(buildNumber) {
    const obj = {
        os: 'Windows', browser: 'Discord Client', release_channel: 'stable',
        client_version: '1.0.9175', os_version: '10.0.26100', os_arch: 'x64',
        app_arch: 'x64', system_locale: 'en-US',
        browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 discord/1.0.9175 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
        browser_version: '32.2.7', client_build_number: buildNumber,
        native_build_number: 59498, client_event_source: null,
    };
    return Buffer.from(JSON.stringify(obj)).toString('base64');
}

// Session store
const sessions = {};

// ==================== ROUTES ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/login', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.json({ error: 'Thiếu token' });

    try {
        const buildNumber = await fetchBuildNumber();
        const sp = makeSuperProperties(buildNumber);

        const r = await axios.get(`${API_BASE}/users/@me`, {
            headers: {
                Authorization: token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 discord/1.0.9175 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
                'X-Super-Properties': sp,
                'X-Discord-Locale': 'en-US',
            },
            timeout: 10000
        });

        const user = r.data;
        sessions[token] = { token, buildNumber, sp, user, quests: [] };
        
        res.json({ success: true, user: { id: user.id, username: user.username, discriminator: user.discriminator } });
    } catch (e) {
        res.json({ error: 'Token không hợp lệ hoặc tài khoản bị khóa' });
    }
});

app.get('/api/quests', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token]) return res.json({ error: 'Chưa đăng nhập' });

    const session = sessions[token];

    try {
        const r = await axios.get(`${API_BASE}/quests/@me`, {
            headers: {
                Authorization: token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 discord/1.0.9175 Chrome/128.0.6613.186 Electron/32.2.7 Safari/537.36',
                'X-Super-Properties': session.sp,
            },
            timeout: 10000
        });

        const data = r.data;
        const questList = data.quests || (Array.isArray(data) ? data : []);

        const quests = questList.map((q, i) => {
            const cfg = q.config || {};
            const msgs = cfg.messages || {};
            const name = msgs.questName || msgs.gameTitle || cfg.application?.name || `Quest#${q.id}`;
            const reward = msgs.rewardName || 'Vật phẩm';
            const userStatus = q.userStatus || q.user_status || {};
            const taskConfig = cfg.taskConfig || cfg.task_config || {};
            const tasks = taskConfig.tasks || {};
            const taskType = Object.keys(tasks).find(t => ['WATCH_VIDEO','PLAY_ON_DESKTOP','STREAM_ON_DESKTOP','PLAY_ACTIVITY'].includes(t));
            const needed = taskType ? (tasks[taskType]?.target || 0) : 0;
            const done = taskType ? (userStatus.progress?.[taskType]?.value || 0) : 0;
            const enrolled = !!userStatus.enrolledAt;
            const completed = !!userStatus.completedAt;

            return {
                id: q.id, name, reward, taskType, needed, done,
                enrolled, completed, running: enrolled && !completed,
                failed: false, _logged: false
            };
        });

        const stats = {
            total: quests.length,
            done: quests.filter(q => q.completed).length,
            running: quests.filter(q => q.running).length,
            failed: quests.filter(q => q.failed).length,
        };

        res.json({ quests, stats });
    } catch (e) {
        res.json({ error: 'Không thể lấy quests: ' + e.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server: http://localhost:${PORT}`);
});
