import { initGlobalTracer } from 'opentracing'
import {
  initTracerFromEnv,
  JaegerTracer,
  TracingConfig,
  TracingOptions,
} from 'jaeger-client'
import {
  middleware as Middleware,
  errMiddlewareWrapper as ErrMiddlewareWrapper,
} from './middlewares'
import { WrapHandler } from './tracer_wrapper'

interface ITracerOpts {
  config?: TracingConfig,
  options?: TracingOptions
}

interface IConfig {
  tracer?: ITracerOpts
}

let initCalled = false

const Init = (cfg?: IConfig): JaegerTracer => {
  const cfgTracer = cfg?.tracer?.config || {}
  const optTracer = cfg?.tracer?.options || {}
  const tracer = initTracerFromEnv(cfgTracer, optTracer)
  initGlobalTracer(tracer)
  initCalled = true
  return tracer
}

const isInit = () => initCalled

export {
  Init,
  isInit,
  Middleware,
  ErrMiddlewareWrapper,
  WrapHandler,
}
