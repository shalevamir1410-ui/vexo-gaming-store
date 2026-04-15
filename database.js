const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;
let isPostgres = false;

// Helper: Convert SQLite ? placeholders to PostgreSQL $1, $2... 
function convertPlaceholders(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
}

// Helper: Convert SQLite-specific SQL to PostgreSQL-compatible SQL
function convertSql(sql) {
    let pgSql = convertPlaceholders(sql);
    // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
    pgSql = pgSql.replace(/INSERT OR IGNORE INTO/g, 'INSERT INTO');
    // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY');
    // INTEGER PRIMARY KEY → SERIAL PRIMARY KEY (for CREATE TABLE)
    pgSql = pgSql.replace(/CREATE TABLE \w+ \([^)]*INTEGER PRIMARY KEY/g, (match) => {
        return match.replace(/INTEGER PRIMARY KEY/g, 'SERIAL PRIMARY KEY');
    });
    // AUTOINCREMENT alone → remove it
    pgSql = pgSql.replace(/AUTOINCREMENT/g, '');
    // DATETIME → TIMESTAMP
    pgSql = pgSql.replace(/DATETIME/g, 'TIMESTAMP');
    // ALTER TABLE ... ADD COLUMN IF NOT EXISTS → just try it, catch error
    return pgSql;
}

// PostgreSQL wrapper that mimics SQLite API
class PgWrapper {
    constructor(pool) {
        this.pool = pool;
        // Expose the pool for direct access (needed for initialization)
        this._rawPool = pool;
    }

    async _query(sql, params = []) {
        // Check if original SQL has INSERT OR IGNORE (need ON CONFLICT DO NOTHING)
        const hasIgnore = /INSERT\s+OR\s+IGNORE/i.test(sql);
        let pgSql = convertSql(sql);
        
        // Auto-add RETURNING id for INSERT statements so this.lastID works
        // But for INSERT OR IGNORE, add ON CONFLICT DO NOTHING instead
        if (/^\s*INSERT\s+/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
            if (hasIgnore) {
                pgSql = pgSql.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING RETURNING id';
            } else {
                pgSql = pgSql.replace(/;\s*$/, '') + ' RETURNING id';
            }
        }
        return await this.pool.query(pgSql, params);
    }

    // db.run(sql, params, callback) - for INSERT, UPDATE, DELETE
    run(sql, paramsOrCallback, maybeCallback) {
        const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
        const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : maybeCallback;
        
        this._query(sql, params).then(result => {
            if (callback) {
                // Mimic SQLite's this.lastID and this.changes
                const context = {
                    lastID: result.rows[0]?.id || result.rows?.insertId || (result.rows && result.rows[0] ? result.rows[0].id : null),
                    changes: result.rowCount || result.rows?.length || 0
                };
                // For INSERT with RETURNING id, get the id
                if (result.rows && result.rows[0] && result.rows[0].id) {
                    context.lastID = result.rows[0].id;
                }
                callback.call(context, null);
            }
        }).catch(err => {
            if (callback) callback.call({ lastID: null, changes: 0 }, err);
        });
    }

    // db.all(sql, params, callback) - returns all rows
    all(sql, paramsOrCallback, maybeCallback) {
        const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
        const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : maybeCallback;
        
        this._query(sql, params).then(result => {
            if (callback) callback(null, result.rows || []);
        }).catch(err => {
            if (callback) callback(err, null);
        });
    }

    // db.get(sql, params, callback) - returns first row
    get(sql, paramsOrCallback, maybeCallback) {
        const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
        const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : maybeCallback;
        
        this._query(sql, params).then(result => {
            if (callback) callback(null, (result.rows && result.rows[0]) || null);
        }).catch(err => {
            if (callback) callback(err, null);
        });
    }
}

// Check if running on Render with PostgreSQL
if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    db = new PgWrapper(pool);
    isPostgres = true;
    console.log('Using PostgreSQL database (Render)');
    initializePostgresTables();
} else {
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
    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        visitor_count INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error('Error creating stats table:', err.message);
        } else {
            db.run(`INSERT OR IGNORE INTO stats (id, visitor_count) VALUES (1, 0)`);
        }
    });

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
    
    db.run(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_notes TEXT DEFAULT 'No invoices or logos, dropshipping order.'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.log('Note: supplier_notes column may already exist or table is new');
        }
    });
    
    db.run(`UPDATE orders SET supplier_notes = 'No invoices or logos, dropshipping order.' WHERE supplier_notes IS NULL OR supplier_notes = ''`, (err) => {
        if (err) {
            console.error('Error updating existing orders with supplier_notes:', err.message);
        } else {
            console.log('Updated existing orders with supplier_notes');
        }
    });
    
    db.run(`ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT`, (err) => {
        if (err) {
            console.log('Note: colors column may already exist');
        }
    });
    
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
        const pool = db._rawPool;
        const client = await pool.connect();
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                visitor_count INTEGER DEFAULT 0
            )
        `);
        await client.query(`INSERT INTO stats (id, visitor_count) VALUES (1, 0) ON CONFLICT DO NOTHING`);
        
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
                maxQuantity INTEGER DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
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
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS dsers_connections (
                id SERIAL PRIMARY KEY,
                consumer_key TEXT NOT NULL,
                consumer_secret TEXT NOT NULL,
                user_id INTEGER,
                scope TEXT,
                callback_url TEXT,
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
