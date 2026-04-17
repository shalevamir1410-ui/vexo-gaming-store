const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios'); 
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname))); 

const db = new sqlite3.Database('./database.sqlite');
const SECRET_KEY = "vexo_pro_secret_998811"; // For Token signing

// --- EMAIL CONFIG (ADMIN/SENDER) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'vstt.vscu.jxyo.bzvv@gmail.com', // Placeholder
        pass: 'vstt vscu jxyo bzvv' // Placeholder
    }
});

const USD_TO_ILS = 3.8;
const CJ_EMAIL = "Shalevamir1410@gmail.com";
const CJ_API_KEY = "CJ5295285@api@e27a42bec7174b39b21e18c5f610e136";

// --- SECURITY HELPERS ---
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, originalHash] = stored.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

function generateToken(user) {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, exp: Date.now() + 24*60*60*1000 })).toString('base64');
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(`${header}.${payload}`).digest('base64');
    return `${header}.${payload}.${signature}`;
}

function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: "נא להתחבר שוב" });
    const parts = token.split('.');
    if (parts.length !== 3) return res.status(401).json({ error: "Token malformed" });
    const [header, payload, signature] = parts;
    const expected = crypto.createHmac('sha256', SECRET_KEY).update(`${header}.${payload}`).digest('base64');
    if (signature !== expected) return res.status(401).json({ error: "חתימה לא תקינה" });
    req.user = JSON.parse(Buffer.from(payload, 'base64').toString());
    next();
}

function adminOnly(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.email !== "Shalevamir1410@gmail.com") {
            return res.status(403).json({ error: "גישה למנהל בלבד" });
        }
        next();
    });
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- DB SCHEMA ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE, password TEXT, plain_password TEXT, name TEXT, address TEXT, city TEXT, zip TEXT, phone TEXT,
        cart_json TEXT DEFAULT '[]', reset_token TEXT, reset_expires INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // הוסף עמודות אם כבר קיימת טבלה ישנה
    db.run(`ALTER TABLE users ADD COLUMN reset_token TEXT`, () => {});
    db.run(`ALTER TABLE users ADD COLUMN reset_expires INTEGER`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY,
        visitor_count INTEGER DEFAULT 0
    )`);
    db.run(`INSERT OR IGNORE INTO stats (id, visitor_count) VALUES (1, 0)`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        productId TEXT, product_name TEXT, items_json TEXT, revenue REAL, cost REAL, profit REAL,
        status TEXT, customer_name TEXT, customer_email TEXT, shipping_address TEXT,
        cj_order_id TEXT, trackingNumber TEXT, payment_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE, name TEXT, price REAL, originalPrice REAL, supplierCost REAL, image TEXT,
        description TEXT, category TEXT, inStock BOOLEAN DEFAULT 1, pid TEXT, vid TEXT,
        provider TEXT DEFAULT 'cj', supplierEmail TEXT DEFAULT 'Shalevamir1410@gmail.com'
    )`);
});

// --- API ---

app.post('/api/auth/register', (req, res) => {
    const { name, email, password, address, city, zip, phone } = req.body;
    if (!name || !email || !password || password.length < 6 || !emailRegex.test(email)) {
        return res.status(400).json({ error: "פרטי הרשמה לא תקינים (מינימום 6 תווים לסיסמה ופורמט מייל תקין)" });
    }
    db.run(`INSERT INTO users (name, email, password, plain_password, address, city, zip, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
        [name, email, hashPassword(password), password, address, city, zip, phone], 
        (err) => err ? res.status(400).json({ error: "האימייל כבר קיים במערכת" }) : res.json({ success: true }));
});

// --- FORGOT PASSWORD ---
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email || !emailRegex.test(email)) return res.status(400).json({ error: "אימייל לא תקין" });

    db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (!user) return res.json({ success: true }); // אל תחשוף אם קיים

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 60 * 60 * 1000; // שעה אחת

        db.run(`UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?`, [resetToken, expires, user.id], async () => {
            const resetLink = `https://vexo-gaming-store.onrender.com/reset-password.html?token=${resetToken}`;
            try {
                await transporter.sendMail({
                    from: 'VEXO Gaming <vstt.vscu.jxyo.bzvv@gmail.com>',
                    to: email,
                    subject: 'VEXO Gaming - איפוס סיסמה',
                    html: `
                        <div dir="rtl" style="font-family:Arial,sans-serif;background:#0a0a0a;color:white;padding:40px;border-radius:12px;max-width:500px;margin:auto;border:1px solid #ff0000;">
                            <h1 style="font-family:Arial;color:white;">VEXO <span style="color:#ff0000;">Gaming</span></h1>
                            <h2>איפוס סיסמה</h2>
                            <p>קיבלנו בקשה לאיפוס הסיסמה שלך. לחץ על הכפתור למטה:</p>
                            <a href="${resetLink}" style="display:inline-block;background:#ff0000;color:white;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0;">אפס סיסמה</a>
                            <p style="color:#aaa;font-size:12px;">הקישור תקף לשעה אחת. אם לא ביקשת איפוס - התעלם מהמייל הזה.</p>
                        </div>
                    `
                });
            } catch (e) { console.error("Reset mail failed:", e.message); }
        });

        res.json({ success: true });
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6) return res.status(400).json({ error: "פרטים לא תקינים" });

    db.get(`SELECT * FROM users WHERE reset_token = ?`, [token], (err, user) => {
        if (!user) return res.status(400).json({ error: "קישור לא תקין" });
        if (Date.now() > user.reset_expires) return res.status(400).json({ error: "הקישור פג תוקף, בקש קישור חדש" });

        db.run(`UPDATE users SET password = ?, plain_password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?`,
            [hashPassword(password), password, user.id],
            (err) => err ? res.status(500).json({ error: "שגיאת שרת" }) : res.json({ success: true })
        );
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: "אימייל או סיסמה לא נכונים" });
        }
        const token = generateToken(user);
        const userData = { ...user };
        delete userData.password;
        res.json({ success: true, token, user: userData });
    });
});

app.get('/api/user/cart', verifyToken, (req, res) => {
    db.get(`SELECT cart_json FROM users WHERE id = ?`, [req.user.userId], (err, row) => {
        res.json({ cart: JSON.parse(row?.cart_json || '[]') });
    });
});

app.post('/api/user/cart', verifyToken, (req, res) => {
    db.run(`UPDATE users SET cart_json = ? WHERE id = ?`, [JSON.stringify(req.body.cart), req.user.userId], () => res.json({ success: true }));
});

app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, (err, rows) => res.json(rows || []));
});

app.post('/api/stats/visit', (req, res) => {
    db.run(`UPDATE stats SET visitor_count = visitor_count + 1 WHERE id = 1`, () => res.json({ success: true }));
});

// --- ADMIN PRODUCT ACTIONS ---
app.post('/api/admin/products', adminOnly, (req, res) => {
    const { sku, name, description, price, originalPrice, supplierCost, image, badge, gallery, category, provider, pid, vid, supplierLink } = req.body;
    const finalSku = sku || 'MAN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const query = `INSERT INTO products (sku, name, description, price, originalPrice, supplierCost, image, badge, gallery, category, provider, pid, vid, supplierLink, inStock) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`;
    const params = [finalSku, name, description || '', price, originalPrice || price, supplierCost || 0, image, badge || '', JSON.stringify(gallery || []), category || 'כללי', provider || 'manual', pid || null, vid || null, supplierLink || null];
    db.run(query, params, function(err) {
        if (err) {
            if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "שגיאה: הקוד (SKU) של המוצר כבר קיים במערכת." });
            return res.status(500).json({ error: "שגיאת בסיס נתונים: " + err.message });
        }
        // אם יש לינק AliExpress — שלוף תמונות מיד
        if (supplierLink && supplierLink.includes('aliexpress')) {
            const newId = this.lastID;
            scrapeAliExpress(supplierLink).then(data => {
                if (!data) return;
                const updates = []; const params2 = [];
                if (data.mainImage) { updates.push('image = ?'); params2.push(data.mainImage); }
                if (data.images.length > 1) { updates.push('gallery = ?'); params2.push(JSON.stringify(data.images.slice(1))); }
                if (data.price) { updates.push('supplierCost = ?'); params2.push(data.price); }
                if (updates.length) { params2.push(newId); db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params2); }
            });
        }
        res.json({ success: true });
    });
});

app.post('/api/admin/login-code', (req, res) => {
    const { code } = req.body;
    if (code === "0256") {
        const user = { id: 1, name: "Admin", email: "Shalevamir1410@gmail.com" };
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
        const payload = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, name: user.name })).toString('base64');
        const signature = crypto.createHmac('sha256', SECRET_KEY).update(`${header}.${payload}`).digest('base64');
        const token = `${header}.${payload}.${signature}`;
        return res.json({ success: true, token, user });
    }
    res.status(401).json({ error: "קוד שגוי" });
});

app.get('/api/admin/users', adminOnly, (req, res) => {
    db.all(`SELECT id, name, email, plain_password, phone, address, city, zip, created_at FROM users`, (err, rows) => res.json(rows || []));
});

app.put('/api/admin/user-password/:id', adminOnly, (req, res) => {
    const { plain_password } = req.body;
    if (!plain_password) return res.status(400).json({ error: 'סיסמה חסרה' });
    db.run(`UPDATE users SET plain_password = ? WHERE id = ?`, [plain_password, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/admin/user-orders/:email', adminOnly, (req, res) => {
    db.all(`SELECT id, product_name, status, trackingNumber, cj_order_id, created_at FROM orders WHERE customer_email = ? ORDER BY id DESC`, 
        [req.params.email], (err, rows) => res.json(rows || []));
});

app.put('/api/products/:id', adminOnly, (req, res) => {
    const { sku, name, description, price, originalPrice, supplierCost, image, gallery, category, provider, pid, vid, supplierLink } = req.body;
    const query = `UPDATE products SET sku=?, name=?, description=?, price=?, originalPrice=?, supplierCost=?, image=?, gallery=?, category=?, provider=?, pid=?, vid=?, supplierLink=? WHERE id=?`;
    const params = [sku, name, description, price, originalPrice, supplierCost, image, JSON.stringify(gallery || []), category, provider, pid, vid, supplierLink || null, req.params.id];
    db.run(query, params, (err) => err ? res.status(500).json({ error: err.message }) : res.json({ success: true }));
});

app.delete('/api/admin/products/:id', adminOnly, (req, res) => {
    db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

app.get('/api/admin/stats', adminOnly, (req, res) => {
    db.all(`SELECT revenue, cost, profit FROM orders`, (err, rows) => {
        const stats = rows.reduce((acc, r) => {
            acc.totalRevenue += (r.revenue || 0);
            acc.totalProfit += (r.profit || 0);
            return acc;
        }, { totalRevenue: 0, totalProfit: 0, totalOrders: rows.length });
        res.json(stats);
    });
});

app.get('/api/dashboard', adminOnly, (req, res) => {
    db.get(`SELECT visitor_count FROM stats WHERE id = 1`, (err, stat) => {
        db.all(`SELECT * FROM orders ORDER BY id DESC LIMIT 5`, (err, orders) => {
            db.get(`SELECT COUNT(*) as user_count FROM users`, (err, userStat) => {
                res.json({
                    stats: { 
                        visitors: stat?.visitor_count || 0,
                        totalUsers: userStat?.user_count || 0
                    },
                    recentOrders: orders || []
                });
            });
        });
    });
});

// 🤖 REAL AUTOMATED CHECKOUT v4.3
app.post('/api/checkout', verifyToken, async (req, res) => {
    const { cart, paymentId, shippingAddress, city, zip, phone } = req.body;
    if (!cart || cart.length === 0) return res.status(400).json({ error: "העגלה ריקה" });

    db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "משתמש לא מחובר" });

        const pNames = cart.map(i => i.name).join(", ");
        const revenue = cart.reduce((acc, i) => acc + (parseFloat(i.price) || 0), 0);
        const cost = cart.reduce((acc, i) => acc + (parseFloat(i.supplierCost) || 0), 0);
        const profit = revenue - cost;

        db.run(`INSERT INTO orders (product_name, items_json, revenue, cost, profit, status, customer_name, customer_email, shipping_address, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pNames, JSON.stringify(cart), revenue, cost, profit, 'ממתין לעיבוד', user.name, user.email, shippingAddress || user.address, paymentId || 'OFFLINE_PAY'],
            async function(err) {
                if (err) {
                    console.error("Order Insert Error:", err.message);
                    return res.status(500).json({ error: "שגיאה ביצירת הזמנה" });
                }
                const orderId = this.lastID;
                
                notifySuppliers(cart, { name: user.name, address: shippingAddress || user.address, city: city || user.city, zip: zip || user.zip, phone: phone || user.phone }, orderId);
                createCjOrderLegacy(cart, { name: user.name, address: shippingAddress || user.address, city: city || user.city, zip: zip || user.zip, phone: phone || user.phone }, orderId);

                db.run(`UPDATE users SET cart_json = '[]' WHERE id = ?`, [user.id]);
                res.json({ success: true, orderId });
            }
        );
    });
});

async function notifySuppliers(cart, customer, orderId) {
    const suppliers = {};
    cart.forEach(item => {
        const sEmail = item.supplierEmail || 'Shalevamir1410@gmail.com';
        if (!suppliers[sEmail]) suppliers[sEmail] = [];
        suppliers[sEmail].push(item);
    });

    for (const sEmail in suppliers) {
        const itemsList = suppliers[sEmail].map(i => `- ${i.name} (ID: ${i.id})`).join('\n');
        const mailOptions = {
            from: 'vstt.vscu.jxyo.bzvv@gmail.com',
            to: sEmail,
            subject: `NEW ORDER: VEXO Gaming #${orderId}`,
            text: `התקבלה הזמנה חדשה:\n\nמוצרים:\n${itemsList}\n\nפרטי לקוח:\nשם: ${customer.name}\nכתובת: ${customer.address}, ${customer.city}\nמיקוד: ${customer.zip}\nטלפון: ${customer.phone}\n\nנא לעדכן לאחר שליחה.`
        };
        try { await transporter.sendMail(mailOptions); } catch (e) { console.error("Mail failed", e.message); }
    }
}

// שליפת נתונים מ-AliExpress לפי לינק
async function scrapeAliExpress(url) {
    try {
        const itemId = url.match(/\/item\/(\d+)/)?.[1];
        if (!itemId) return null;
        const res = await axios.get(`https://www.aliexpress.com/item/${itemId}.html`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });
        const html = res.data;
        // שליפת מחיר
        const priceMatch = html.match(/"minActivityAmount":\{"value":"?([\d.]+)"?/) ||
                           html.match(/"minAmount":\{"value":"?([\d.]+)"?/) ||
                           html.match(/\"price\":\"([\d.]+)\"/);
        const price = priceMatch ? parseFloat(priceMatch[1]) * USD_TO_ILS : null;
        // שליפת תמונות
        const imgMatches = [...html.matchAll(/"imageUrl"\s*:\s*"(https:\/\/ae01\.alicdn\.com[^"]+)"/g)];
        const images = [...new Set(imgMatches.map(m => m[1].replace(/\\\//g, '/')))].slice(0, 8);
        return { price, images, mainImage: images[0] || null };
    } catch(e) { return null; }
}

// סנכרון מוצרי AliExpress כל שעה
async function autoSyncAliProducts() {
    console.log('🛒 סנכרון AliExpress...');
    db.all(`SELECT id, supplierLink, supplierCost FROM products WHERE provider = 'manual' AND supplierLink LIKE '%aliexpress%'`, async (err, products) => {
        if (err || !products || !products.length) return;
        for (const p of products) {
            const data = await scrapeAliExpress(p.supplierLink);
            if (!data) continue;
            const updates = []; const params = [];
            if (data.mainImage) { updates.push('image = ?'); params.push(data.mainImage); }
            if (data.images.length > 1) { updates.push('gallery = ?'); params.push(JSON.stringify(data.images.slice(1))); }
            if (data.price && Math.abs(data.price - p.supplierCost) > 0.5) { updates.push('supplierCost = ?'); params.push(data.price); }
            if (updates.length) { params.push(p.id); db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params); console.log(`✅ AliExpress עודכן מוצר #${p.id}`); }
        }
        console.log('✅ סנכרון AliExpress הסתיים');
    });
}

autoSyncAliProducts();
setInterval(autoSyncAliProducts, 60 * 60 * 1000);

async function getCjToken() {
    const r = await axios.post('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', { email: CJ_EMAIL, apiKey: CJ_API_KEY });
    return r.data?.data?.accessToken;
}

// סנכרון אוטומטי של תמונות + מחיר מ-CJ כל שעה
async function autoSyncCjProducts() {
    console.log('🔄 סנכרון CJ...');
    try {
        const token = await getCjToken();
        db.all(`SELECT id, pid, supplierCost FROM products WHERE provider = 'cj' AND pid IS NOT NULL AND pid != ''`, async (err, products) => {
            if (err || !products || !products.length) return;
            for (const p of products) {
                try {
                    const res = await axios.get(`https://developers.cjdropshipping.com/api2.0/v1/product/query?pid=${p.pid}`, { headers: { 'CJ-Access-Token': token } });
                    const data = res.data?.data;
                    if (!data) continue;
                    const mainImg = data.productImage || null;
                    const gallery = (data.productImageSet || []).map(i => i.imageUrl || i).filter(Boolean);
                    const newCost = data.sellPrice ? parseFloat(data.sellPrice) * USD_TO_ILS : null;
                    const updates = []; const params = [];
                    if (mainImg) { updates.push('image = ?'); params.push(mainImg); }
                    if (gallery.length) { updates.push('gallery = ?'); params.push(JSON.stringify(gallery)); }
                    if (newCost && Math.abs(newCost - p.supplierCost) > 0.5) { updates.push('supplierCost = ?'); params.push(newCost); }
                    if (updates.length) { params.push(p.id); db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params); }
                } catch(e) {}
            }
            console.log('✅ סנכרון CJ הסתיים');
        });
    } catch(e) { console.error('❌ שגיאת סנכרון CJ:', e.message); }
}

// הרץ מיד ואז כל שעה
autoSyncCjProducts();
setInterval(autoSyncCjProducts, 60 * 60 * 1000);
setInterval(autoSyncAliProducts, 60 * 60 * 1000);

async function createCjOrderLegacy(cart, customer, orderId) {
    const cjItems = cart.filter(i => i.vid);
    if (cjItems.length === 0) return;
    try {
        const token = await getCjToken();
        const payload = {
            orderNumber: `VEXO-${orderId}`, shippingZipCode: customer.zip, shippingCountryCode: "IL", shippingProvince: customer.city,
            shippingCity: customer.city, shippingAddress: customer.address, shippingCustomerName: customer.name, shippingPhone: customer.phone,
            remark: "Blind dropshipping. No invoice.", orderProductList: cjItems.map(i => ({ quantity: 1, vid: i.vid }))
        };
        const res = await axios.post('https://developers.cjdropshipping.com/api2.0/v1/order/create', payload, { headers: { 'CJ-Access-Token': token } });
        if (res.data.success) db.run(`UPDATE orders SET cj_order_id = ? WHERE id = ?`, [res.data.data.orderId, orderId]);
    } catch (e) {}
}

app.get('/api/user/orders', verifyToken, (req, res) => {
    db.all(`SELECT * FROM orders WHERE customer_email = ? ORDER BY id DESC`, [req.user.email], (err, rows) => {
        res.json(rows || []);
    });
});

app.listen(3000, () => console.log('🚀 VEXO PRO v4.1 - STABLE ENGINE RUNNING'));
