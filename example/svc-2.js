const Express = require('express')
const { Init, Middleware, ErrMiddlewareWrapper, WrapHandler } = require('../dist')

const app = Express()

Init({
  tracer: {
    config: {
      serviceName: 'SVC 2',
      sampler: {
        type: 'const',
        param: 1,
      },
      reporter: {
        logSpans: true, // set false to disable spans logging
      }
    },
    options: {
      logger: {
        info: function logInfo(msg) {
            console.log("INFO ", msg);
        },
        error: function logError(msg) {
            console.log("ERROR", msg);
        },
    },
    }
  }
})

app.use(Middleware())

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const sleepExec = (milis, fn) => new Promise((res, rej) => setTimeout(() => res(fn()), milis))

const getFromInventoryA = async function() {
  return await sleepExec(randInt(100, 5000), () => ['T-Shirt', 'Black Shoes'])
}

const getFromInventoryB = async function() {
  return await sleepExec(randInt(100, 5000), () => ['Jacket', 'Hoodie'])
}

const getListProducts = async function() {
  const TgetFromInventoryA = this.traceFn(getFromInventoryA)
  const TgetFromInventoryB = this.traceFn(getFromInventoryB)

  const res = await Promise.all([
    TgetFromInventoryA(),
    TgetFromInventoryB(),
  ])

  return res
}

const ListProducts = WrapHandler(async function(req, res) {
  const TGetListProducts = this.traceFn(getListProducts)

  const products = await TGetListProducts()

  res.json({
    products,
  })
}, 'Products List')

app.get('/products', ListProducts)

app.use(ErrMiddlewareWrapper((err, _, res) => {
  return res.status(500).json({
    error: true,
    message: 'Something Wrong:' + err.message
  })
}))

app.listen("8081", () => console.log('SVC-2 started at:8081'))