const Express = require('express')
const { Init, Middleware, ErrMiddlewareWrapper, WrapHandler } = require('../dist')

const app = Express()

Init({
  tracer: {
    config: {
      serviceName: 'SVC 1',
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

const Home = WrapHandler(async function(req, res) {
  const getCompanyProfileT = this.traceFn(getCompanyProfile, 'getCompanyProfile')

  const companyProfile = await getCompanyProfileT()

  res.json({
    page: 'Home',
    companyProfile,
  })
}, 'Home Handler')

app.get('/', Home)
app.get('/home', Home)
app.get('/listing', WrapHandler((req, res) => {
  res.json({
    page: 'Listing'
  })
}, 'Home Handler'))

app.use(ErrMiddlewareWrapper((err, _, res) => {
  return res.status(500).json({
    error: true,
    message: 'Something Wrong:' + err.message
  })
}))

app.listen("8080", () => console.log('SVC-1 started at:8080'))