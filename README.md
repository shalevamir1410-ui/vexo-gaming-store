# VEXO Gaming Store

חנות גיימינג דרופשיפינג בעברית עם אינטגרציה ל-CJ Dropshipping ומעקב אוטומטי אחרי משלוחים.

## 🚀 תכונות עיקריות

- 🎮 קטלוג מוצרי גיימינג בעברית
- 🔄 סנכרון אוטומטי עם CJ Dropshipping
- 📦 מעקב אוטומטי אחרי מספרי משלוח
- 👤 מערכת משתמשים והזמנות
- 💳 תשלום באמצעות PayPal
- 📱 ממשק רספונסיבי בעברית (RTL)

## 📋 דרישות מקדימות

- Node.js (גרסה 18 ומעלה)
- npm או yarn

## 🛠️ התקנה מקומית

### 1. שכפול הפרויקט

```bash
git clone https://github.com/YOUR_USERNAME/vexo-gaming-store.git
cd vexo-gaming-store
```

### 2. התקנת חבילות

```bash
npm install
```

### 3. הגדרת משתני סביבה

```bash
cp .env.example .env
```

ערוך את הקובץ `.env` והוסף את המפתחות שלך:

```env
JWT_SECRET=your-super-secret-key
CJ_API_KEY=your-cj-api-key
```

### 4. הפעלת השרת

```bash
# מצב פיתוח
npm run dev

# מצב ייצור
npm start
```

השרת ירוץ על `http://localhost:3000`

## ☁️ פריסה בענן

### אפשרות 1: Render (מומלץ)

Render מציעה חינם אחסון מלא עם PostgreSQL.

#### שלב 1: העלאה ל-GitHub

1. צור repository חדש ב-GitHub
2. העלה את הקוד:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vexo-gaming-store.git
git push -u origin main
```

**קבצים שחייבים להיות ב-GitHub:**
- ✅ `server.js`
- ✅ `package.json`
- ✅ `package-lock.json`
- ✅ `index.html`
- ✅ `dashboard.html`
- ✅ `admin-login.html`
- ✅ `database.js`
- ✅ `.env.example`
- ✅ `.gitignore`
- ✅ `README.md`
- ❌ `.env` (לעולם אל תעלה!)
- ❌ `database.sqlite` (הקובץ ייווצר מחדש בענן)
- ❌ `node_modules/` (מותקן אוטומטית)

#### שלב 2: פריסה ב-Render

1. גש ל-[render.com](https://render.com) והתחבר עם GitHub
2. לחץ "New" → "Web Service"
3. בחר את ה-repository שלך
4. הגדרות:
   - **Name**: `vexo-gaming-store`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. לחץ "Advanced" והוסף משתני סביבה:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: (מפתח אקראי חזק)
   - `CJ_API_KEY`: (המפתח שלך מ-CJ)

6. לחץ "Create Web Service"

#### שלב 3: מסד נתונים ב-Render (PostgreSQL)

1. ב-Render Dashboard → "New" → "PostgreSQL"
2. שם: `vexo-db`
3. Plan: Free
4. אחרי היצירה, העתק את ה-"Internal Database URL"
5. הוסף כמשתנה סביבה ב-Web Service: `DATABASE_URL`

### אפשרות 2: Railway

Railway גם מציעה tier חינם עם מסד נתונים.

#### שלב 1: פריסה

1. גש ל-[railway.app](https://railway.app)
2. לחץ "New Project" → "Deploy from GitHub repo"
3. בחר את ה-repository שלך
4. Railway יזהה אוטומטית את `package.json`

#### שלב 2: משתני סביבה

1. ב-Project Settings → Variables
2. הוסף:
   - `JWT_SECRET`
   - `CJ_API_KEY`
   - `NODE_ENV`: `production`

#### שלב 3: מסד נתונים

1. לחץ "New" → Database → Add PostgreSQL
2. Railway יחבר אוטומטית את ה-`DATABASE_URL`

## 🗄️ מסד נתונים

### SQLite (ברירת מחדל - מקומי)

```javascript
// ב-server.js
const db = new sqlite3.Database('./database.sqlite', ...);
```

### PostgreSQL (ענן)

**אם אתה עובר ל-PostgreSQL, שנה את הקוד ב-server.js:**

```javascript
// החלף את:
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database.sqlite', ...);

// ב-:
const { Pool } = require('pg');
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
```

**התקן pg:**
```bash
npm install pg
```

### Railway MySQL

```javascript
const mysql = require('mysql2/promise');
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
```

## 🔐 משתני סביבה נדרשים

| משתנה | תיאור | חובה |
|-------|--------|------|
| `PORT` | פורט השרת | לא (ברירת מחדל: 3000) |
| `JWT_SECRET` | מפתח לחתימת טוקנים | כן |
| `CJ_API_KEY` | מפתח API של CJ Dropshipping | כן |
| `DATABASE_URL` | כתובת מסד נתונים | לא (SQLite ברירת מחדל) |
| `NODE_ENV` | סביבת ריצה | מומלץ: `production` |

## 🔄 סנכרון CJ אוטומטי

השרת מסנכרן אוטומטית:
- **מוצרים**: כל 30 דקות
- **מספרי מעקב**: כל 2 שעות

ניתן לסנכרן ידנית דרך הדאשבורד או דרך API.

## 📝 API Endpoints

### סנכרון CJ
- `GET /api/admin/cj-test` - בדיקת חיבור
- `POST /api/admin/cj-sync-tracking` - סנכרון מספרי מעקב

### הזמנות
- `GET /api/orders` - רשימת הזמנות
- `POST /api/orders` - יצירת הזמנה
- `PUT /api/orders/:id/tracking` - עדכון מספר מעקב

### מוצרים
- `GET /api/products` - רשימת מוצרים
- `POST /api/products` - יצירת מוצר
- `PUT /api/products/:id` - עדכון מוצר

## 🛡️ אבטחה

- ✅ כל סודות נטענים ממשתני סביבה
- ✅ JWT לאימות
- ✅ bcrypt להצפנת סיסמאות
- ✅ CORS מוגדר
- ✅ אין חשיפת מידע רגיש בקוד

## 🐛 תקלות נפוצות

### שגיאת "Cannot find module"
```bash
rm -rf node_modules
npm install
```

### שגיאת PORT תפוס
```bash
npx kill-port 3000
```

### שגיאת מסד נתונים בענן
- ודא שהקובץ `.env` לא נטען לענן (אמור להיות ב-.gitignore)
- בדוק את משתנה `DATABASE_URL` בפלטפורמה

## 📞 תמיכה

לשאלות ובעיות:
- פתח issue ב-GitHub
- או פנה למפתח: shalevamir1410@gmail.com

## 📄 רישיון

MIT License - ראה קובץ [LICENSE](LICENSE) לפרטים.

---

**נבנה עם ❤️ על ידי Shalev Amir**
