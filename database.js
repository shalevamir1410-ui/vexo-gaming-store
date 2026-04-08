const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeTables();
    }
});

function initializeTables() {
    // Stats table first
    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        visitor_count INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error('Error creating stats table:', err.message);
        } else {
            // Initialize visitor count if not exists
            db.run(`INSERT OR IGNORE INTO stats (id, visitor_count) VALUES (1, 0)`);
        }
    });

    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        zip TEXT,
        cart_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        originalPrice REAL,
        supplierCost REAL,
        image TEXT,
        gallery TEXT,
        description TEXT,
        category TEXT,
        inStock INTEGER DEFAULT 1,
        pid TEXT,
        vid TEXT,
        provider TEXT,
        supplierLink TEXT
    )`);

    // Orders table with tracking support
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_name TEXT NOT NULL,
        items_json TEXT NOT NULL,
        revenue REAL NOT NULL,
        cost REAL NOT NULL,
        profit REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        trackingNumber TEXT,
        carrier TEXT DEFAULT 'israel_post',
        tracking_status TEXT,
        tracking_details TEXT,
        last_tracking_check DATETIME,
        cj_order_id TEXT,
        payment_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    console.log('Database tables initialized successfully.');
}

module.exports = db;
