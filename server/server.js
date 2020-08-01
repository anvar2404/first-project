import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

const { readFile, writeFile, unlink } = require('fs').promises

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

// server.get('/api/v1/users', async (req, res) => {
//   const { data: users } = await axios.get('https://jsonplaceholder.typicode.com/users')
//   res.json(users)
// })
//
// server.get('/api/v1/user/:id', async (req, res) => {
//   const { id } = req.params
//   const { data: user } = await axios.get(`https://jsonplaceholder.typicode.com/users/${id}`)
//   res.json(user)
// })
//
// server.get('/api/v1/sw/:id', async (req, res) => {
//   const { id } = req.params
//   const { data: people } = await axios.get(`https://swapi.dev/api/people/${id}/`)
//   // const result = people.results
//   res.json(people)
// })

const write = async (usersToWrite) => {
  await writeFile(`${__dirname}/users.json`, JSON.stringify(usersToWrite, 1, 2), {
    encoding: 'utf8'
  })
} // работает и без async await

const read = () => {
  return readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then((result) => JSON.parse(result))
    .catch(async () => {
      const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
      await write(users)
      return users
    })
}

server.get('/api/v1/users', async (req, res) => {
  const users = await read()
  res.json(users)
})

server.post('/api/v1/users', async (req, res) => {
  const users = await read()
  const newUser = { id: users[users.length - 1].id + 1, ...req.body }
  const composeUsers = [...users, newUser]
  await write(composeUsers)
  res.json({ status: 'added successfully' })
})

server.patch('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  const users = await read()
  const updatedUsers = users.map((user) => (user.id === +userId ? { ...user, ...req.body } : user))
  await write(updatedUsers)
  res.json({ status: 'updated successfully' })
})

server.delete('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  const users = await read()
  const deleteUser = users.filter((user) => user.id !== +userId)
  await write(deleteUser)
  res.json({ status: 'deleted successfully' })
})

server.delete('/api/v1/users', async (req, res) => {
  unlink(`${__dirname}/users.json`)
  res.json({ status: 'deleted successfully' })
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Boilerplate'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
