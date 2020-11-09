const { WrapHandler } = require('../dist')
const https = require('http')
const { globalTracer, FORMAT_HTTP_HEADERS, Tags } = require('opentracing')
const Router = require('express').Router()

let counter = 0

const hitUserCounter = () => {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res(++counter)
    }, 500)
  })
}

const getCompanyProfile = () => {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res(`Awesome Company!`)
    }, 200)
  })
}

const Home = WrapHandler(async function (req, res) {
  const getCompanyProfileT = this.traceFn(getCompanyProfile, 'getCompanyProfile')

  const companyProfile = await getCompanyProfileT()

  res.json({
    page: 'Home',
    companyProfile,
  })
}, 'Home Handler')

Router.get('/', WrapHandler(function (_, _, next) {
  return hitUserCounter().then(() => next())
}, 'IndexHomeMiddleware'), Home)

Router.get('/home', Home)

class Person {
  name;
  
  constructor(name) {
    this.name = name
  }

  sayName() {
    return `Hi ${this.name}`
  }
};

Router.get('/hello/:name', WrapHandler(function(req, res){
  const p = new Person(req.params.name)

  const sayPersonName = this.traceFn(p.sayName, 'Person: sayName', { context: p })

  res.json({
    greeting: sayPersonName()
  })
}, 'Person: Hello'))

Router.get('/listing', WrapHandler(async function (req, res) {
  const requestHeaders = {}
  globalTracer()
    .inject(
      this.getSpan(),
      FORMAT_HTTP_HEADERS,
      requestHeaders,
    )

  const httpReqProducts = () => new Promise((resolve, reject) => {
    const s = this.createChildSpan('http SVC-2 Products')
    https.request({
      hostname: 'localhost',
      port: '8081',
      path: '/products',
      method: 'GET',
      headers: requestHeaders
    }, resp => {
      resp.on('data', (buff) => {
        s.finish()
        resolve(JSON.parse(buff.toString('utf-8')))
      })
    })
      .on('error', (e) => {
        s.setTag(Tags.SAMPLING_PRIORITY, 1)
        s.setTag(Tags.ERROR, true)
        s.log({ event: 'error', message: e })
        s.finish()
        reject(e)
      })
      .end()
  })

  let products = []
  try {
    products = await httpReqProducts()
  } catch (err) { }

  res.json({
    page: 'Listing Products',
    products,
  })
}, 'Listing Handler'))

module.exports = Router