const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

// Check if running on Render with PostgreSQL
if (process.env.DATABASE_URL) {
    // Use PostgreSQL on Render
    const { Pool } = require('pg');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log('Using PostgreSQL database (Render)');
    initializePostgresTables();
} else {
    // Use SQLite locally
    const dbPath = path.join(__dirname, 'database.sqlite');
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error opening database:', err.message);
        } else {
            console.log('Connected to SQLite database (local).');
            initializeTables();
        }
    });
}

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

    // Products table with color options and max quantity
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
        supplierLink TEXT,
        colors TEXT,
        maxQuantity INTEGER DEFAULT 10
    )`);

    // Orders table with tracking support and supplier notes
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
        supplier_notes TEXT DEFAULT 'No invoices or logos, dropshipping order.',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Migration: Add supplier_notes column to existing orders table (if not exists)
    db.run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_notes TEXT DEFAULT 'No invoices or logos, dropshipping order.'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('Note: supplier_notes column may already exist or table is new');
        }
    });
    
    // Update existing orders without supplier_notes
    db.run(`UPDATE orders SET supplier_notes = 'No invoices or logos, dropshipping order.' WHERE supplier_notes IS NULL OR supplier_notes = ''`, (err) => {
        if (err) {
            console.error('Error updating existing orders with supplier_notes:', err.message);
        } else {
            console.log('Updated existing orders with supplier_notes');
        }
    });
    
    // Migration: Add colors column to products
    db.run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT`, (err) => {
        if (err) {
            console.log('Note: colors column may already exist');
        }
    });
    
    // Migration: Add maxQuantity column to products
    db.run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS maxQuantity INTEGER DEFAULT 10`, (err) => {
        if (err) {
            console.log('Note: maxQuantity column may already exist');
        }
    });
    
    console.log('Database tables initialized successfully.');
}

// PostgreSQL initialization
async function initializePostgresTables() {
    try {
        const client = await db.connect();
        
        // Stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                visitor_count INTEGER DEFAULT 0
            )
        `);
        await client.query(`INSERT INTO stats (id, visitor_count) VALUES (1, 0) ON CONFLICT DO NOTHING`);
        
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                plain_password TEXT,
                phone TEXT,
                address TEXT,
                city TEXT,
                zip TEXT,
                cart_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Products table
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
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
                supplierLink TEXT,
                colors TEXT,
                maxQuantity INTEGER DEFAULT 10
            )
        `);
        
        // Orders table
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
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
                last_tracking_check TIMESTAMP,
                cj_order_id TEXT,
                payment_id TEXT,
                supplier_notes TEXT DEFAULT 'No invoices or logos, dropshipping order.',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        client.release();
        console.log('PostgreSQL tables initialized successfully.');
    } catch (err) {
        console.error('Error initializing PostgreSQL tables:', err);
    }
}

module.exports = db;
