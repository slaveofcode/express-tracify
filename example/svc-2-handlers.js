const { WrapHandler } = require('../dist')
const Router = require('express').Router()

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const sleepExec = (milis, fn) => new Promise((res, rej) => setTimeout(() => res(fn()), milis))

const getFromInventoryA = async function() {
  const span = this.startSpan('subProcess')
  span.log({
    event: 'subProcess',
    message: 'create new child span'
  })

  await sleepExec(200, () => {})

  // must call finish manually
  span.finish()

  return await sleepExec(randInt(100, 5000), () => ['T-Shirt', 'Black Shoes'])
}

const getFromInventoryB = async function() {
  this.getSpan().log({
    event: 'getFromInventoryB.log',
    message: 'Some information to be displayed'
  })
  return await sleepExec(randInt(10, 300), () => ['Jacket', 'Hoodie'])
}

const getListProducts = async function() {
  const [TgetFromInventoryA, TgetFromInventoryB] = this.traceFns([
    [getFromInventoryA],
    [getFromInventoryB, 'getFromInventory'] // custom name
  ])

  const res = await Promise.all([
    TgetFromInventoryA(),
    TgetFromInventoryB(),
  ])

  return res
}

Router.get('/products', WrapHandler(async function ListProducts(req, res) {
  const TGetListProducts = this.traceFn(getListProducts)

  const products = await TGetListProducts()
  console.log("ListProducts -> products", products)

  res.json({
    products,
  })
}))

module.exports = Router