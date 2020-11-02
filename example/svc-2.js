const Express = require('express')
const { Init, Middleware, ErrMiddlewareWrapper } = require('../dist')

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

app.use(require('./svc-2-handlers'))

app.use(ErrMiddlewareWrapper((err, _, res) => {
  return res.status(500).json({
    error: true,
    message: 'Something Wrong: ' + (err.message || err),
  })
}))

app.listen("8081", () => console.log('SVC-2 started at:8081'))