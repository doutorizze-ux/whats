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
    const connection = await mysql.createConnection(config)
    await createTableIfNotExists(connection)

    const readData = async (type, id) => {
        const pk = `${sessionId}:${type}:${id}`
        const [rows] = await connection.execute('SELECT data FROM wa_sessions WHERE pk = ?', [pk])
        if (rows.length === 0) return null
        const data = JSON.parse(rows[0].data, BufferJSON.reviver)
        return data
    }

    const writeData = async (data, type, id) => {
        const pk = `${sessionId}:${type}:${id}`
        const json = JSON.stringify(data, BufferJSON.replacer)
        await connection.execute(
            'INSERT INTO wa_sessions (pk, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
            [pk, json, json]
        )
    }

    const removeData = async (type, id) => {
        const pk = `${sessionId}:${type}:${id}`
        await connection.execute('DELETE FROM wa_sessions WHERE pk = ?', [pk])
    }

    const creds = (await readData('creds', 'base')) || initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {}
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(type, id)
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value)
                            }
                            data[id] = value
                        })
                    )
                    return data
                },
                set: async (data) => {
                    const tasks = []
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id]
                            if (value) {
                                tasks.push(writeData(value, category, id))
                            } else {
                                tasks.push(removeData(category, id))
                            }
                        }
                    }
                    await Promise.all(tasks)
                },
            },
        },
        saveCreds: () => {
            return writeData(creds, 'creds', 'base')
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
