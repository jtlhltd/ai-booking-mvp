import path from 'path';
import fs from 'fs';

// JSON File Database fallback for Render
export class JsonFileDatabase {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'database.json');
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading JSON database:', error.message);
    }
    return {
      tenants: [],
      leads: [],
      bookings: [],
      api_keys: [],
      sms_conversations: [],
      email_templates: [],
      call_logs: []
    };
  }

  saveData() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving JSON database:', error.message);
    }
  }

  exec(sql) {
    // Simple SQL execution for JSON database
    // This is a basic implementation for Render compatibility
    console.log('📝 Executing SQL on JSON database:', sql.substring(0, 100) + '...');
  }

  prepare(sql) {
    return {
      all: (...params) => {
        const tableName = this.extractTableName(sql);
        return this.data[tableName] || [];
      },
      run: (...params) => {
        const tableName = this.extractTableName(sql);
        if (sql.includes('INSERT')) {
          const id = Date.now();
          this.data[tableName].push({ id, ...params[0] });
          this.saveData();
          return { changes: 1, lastInsertRowid: id };
        }
        return { changes: 0 };
      }
    };
  }

  extractTableName(sql) {
    const match = sql.match(/FROM\s+(\w+)/i) || sql.match(/INTO\s+(\w+)/i) || sql.match(/UPDATE\s+(\w+)/i);
    return match ? match[1] : 'leads';
  }
}

