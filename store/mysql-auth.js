import mysql from 'mysql2/promise'
import { BufferJSON, initAuthCreds, proto } from 'baileys'

const createTableIfNotExists = async (connection) => {
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS wa_sessions (
            pk VARCHAR(255) NOT NULL,
            data LONGTEXT NOT NULL,
            PRIMARY KEY (pk)
        )
    `)
}

export const useMySQLAuthState = async (config, sessionId) => {
    const pool = mysql.createPool({ ...config, waitForConnections: true, connectionLimit: 50, queueLimit: 0 })

    // Create table
    const connection = await pool.getConnection()
    await createTableIfNotExists(connection)
    connection.release()

    // Local memory cache
    const memoryCache = new Map()

    // Load all data for this session into memory at startup
    const [rows] = await pool.execute('SELECT pk, data FROM wa_sessions WHERE pk LIKE ?', [`${sessionId}:%`])
    rows.forEach(row => {
        const key = row.pk.split(':').slice(1).join(':') // remove sessionId prefix
        memoryCache.set(key, JSON.parse(row.data, BufferJSON.reviver))
    })

    // Buffer for pending writes
    let writeBuffer = new Map()
    let deleteBuffer = new Set()
    let isSaving = false

    const flushToDB = async () => {
        if (isSaving || (writeBuffer.size === 0 && deleteBuffer.size === 0)) return
        isSaving = true

        try {
            const connection = await pool.getConnection()
            await connection.beginTransaction()

            // Process deletes
            if (deleteBuffer.size > 0) {
                for (const key of deleteBuffer) {
                    const pk = `${sessionId}:${key}`
                    await connection.execute('DELETE FROM wa_sessions WHERE pk = ?', [pk])
                }
                deleteBuffer.clear()
            }

            // Process writes
            if (writeBuffer.size > 0) {
                for (const [key, data] of writeBuffer) {
                    const pk = `${sessionId}:${key}`
                    const json = JSON.stringify(data, BufferJSON.replacer)
                    await connection.execute(
                        'INSERT INTO wa_sessions (pk, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
                        [pk, json, json]
                    )
                }
                writeBuffer.clear()
            }

            await connection.commit()
            connection.release()
        } catch (err) {
            console.error('Error saving session to DB:', err)
        } finally {
            isSaving = false
        }
    }

    // Flush periodically
    setInterval(flushToDB, 5000)

    return {
        state: {
            creds: memoryCache.get('creds:base') || initAuthCreds(),
            keys: {
                get: (type, ids) => {
                    const data = {}
                    ids.forEach(id => {
                        const key = `${type}:${id}`
                        let value = memoryCache.get(key)
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value)
                        }
                        data[id] = value
                    })
                    return data
                },
                set: (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id]
                            const key = `${category}:${id}`
                            if (value) {
                                memoryCache.set(key, value)
                                writeBuffer.set(key, value)
                                deleteBuffer.delete(key)
                            } else {
                                memoryCache.delete(key)
                                deleteBuffer.add(key)
                                writeBuffer.delete(key)
                            }
                        }
                    }
                    // Trigger a flush but don't await it to avoid blocking
                    flushToDB()
                },
            },
        },
        saveCreds: () => {
            const creds = memoryCache.get('creds:base')
            writeBuffer.set('creds:base', creds)
            return flushToDB()
        },
    }
}

export const getAllSessionIds = async (config) => {
    const connection = await mysql.createConnection(config)
    await createTableIfNotExists(connection)
    const [rows] = await connection.execute('SELECT DISTINCT pk FROM wa_sessions WHERE pk LIKE "%:creds:base"')
    return rows.map(row => row.pk.split(':')[0])
}

export const removeAllSessionData = async (config, sessionId) => {
    const connection = await mysql.createConnection(config)
    await connection.execute('DELETE FROM wa_sessions WHERE pk LIKE ?', [`${sessionId}:%`])
}
