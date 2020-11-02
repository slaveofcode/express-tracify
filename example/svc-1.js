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

app.use(require('./svc-1-handlers'))

app.use(ErrMiddlewareWrapper((err, _, res) => {
  return res.status(500).json({
    error: true,
    message: 'Something Wrong: ' + (err.message || err),
  })
}))

app.listen("8080", () => console.log('SVC-1 started at:8080'))