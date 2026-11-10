const fs = require('fs')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const API = 'http://127.0.0.1:3000'

process.on('uncaughtException', (e) => { console.log('UNCAUGHT', e) })
process.on('unhandledRejection', (e) => { console.log('UNHANDLED', e) })

;(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', { useUnifiedTopology: true, useNewUrlParser: true })
  const User = require('../models/User')
  const u = await User.findOne({}).lean()
  console.log('user', u._id)
  const privateKey = fs.readFileSync('./auth/private.pem', 'utf8')
  const token = jwt.sign({ uid: String(u._id) }, privateKey, { algorithm: 'RS256' })
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
  console.log('FormData?', typeof FormData, 'Blob?', typeof Blob, 'fetch?', typeof fetch)
  console.log('A: plain GET ...')
  const g = await fetch(API + '/keys')
  console.log('   GET /keys ->', g.status)
  console.log('B: POST json ...')
  const j = await fetch(API + '/api/timeline', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ backgroundImage: 'x', items: [] }),
  })
  console.log('   PUT json ->', j.status, await j.text())
  console.log('C: POST multipart ...')
  const fd = new FormData()
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'smoke.png')
  const res = await fetch(API + '/upload/timeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  })
  console.log('status', res.status, await res.text())
  mongoose.disconnect()
})().catch((e) => { console.log('CAUGHT', e) })
