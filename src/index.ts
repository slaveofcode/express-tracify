import { initGlobalTracer } from 'opentracing'
import {
  initTracerFromEnv,
  JaegerTracer,
  TracingConfig,
  TracingOptions,
} from 'jaeger-client'
import {
  middleware,
} from './middlewares'

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

export default {
  Init,
  isInit,
  Traceify: middleware,
}
