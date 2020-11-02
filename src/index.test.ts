import { initTracer } from 'jaeger-client'
import { globalTracer } from 'opentracing'
import Main from '.'

const { Init } = Main

beforeEach(() => {
  delete process.env.JAEGER_SERVICE_NAME
  delete process.env.JAEGER_SAMPLER_TYPE
  delete process.env.JAEGER_SAMPLER_PARAM

  jest.resetModules()
})

test('Init should throw when no ENV setup', () => {
  const fn = () => Init()
  expect(fn).toThrowError('config.serviceName must be provided')
})

test('Init should able to set global tracer', () => {
  const t = Init({
    tracer: {
      config: {
        serviceName: 'test',
      },
    },
  })

  const t2 = initTracer({
    serviceName: 'real',
  }, {})

  const opentracingTracer = globalTracer()
  const span = opentracingTracer.startSpan('')

  const originTracer = span.tracer()

  expect(originTracer).toEqual(t)
  expect(originTracer).not.toEqual(t2)
})

test('Init should able to create new Tracer via ENV', () => {
  process.env.JAEGER_SERVICE_NAME = 'test'
  process.env.JAEGER_SAMPLER_TYPE = 'const'
  process.env.JAEGER_SAMPLER_PARAM = '1'

  const fn = () => Init()

  expect(fn).not.toThrowError('config.serviceName must be provided')
  expect((fn() as any)._serviceName).toEqual('test')
  expect((fn() as any)._sampler._name).toEqual('ConstSampler')
})

test('Init should able to create new Tracer via direct config', () => {
  const tracer = Init({
    tracer: {
      config: {
        serviceName: 'real',
        sampler: {
          type: 'probabilistic',
          param: 0.5,
        },
      },
    },
  })

  expect((tracer as any)._serviceName).toEqual('real')
  expect((tracer as any)._sampler._name).toEqual('ProbabilisticSampler')
})

test('Init should respect the creation of the new Tracer via direct config', () => {
  process.env.JAEGER_SERVICE_NAME = 'test'
  process.env.JAEGER_SAMPLER_TYPE = 'const'
  process.env.JAEGER_SAMPLER_PARAM = '1'

  const tracer = Init({
    tracer: {
      config: {
        sampler: {
          type: 'probabilistic',
          param: 0.5,
        },
      },
    },
  })

  expect((tracer as any)._serviceName).toEqual('test')
  expect((tracer as any)._sampler._name).toEqual('ProbabilisticSampler')
})

test('Init status should be changed once initialized', () => {
  process.env.JAEGER_SERVICE_NAME = 'test'

  const M = jest.requireActual('./index').default

  expect(M.isInit()).toEqual(false)

  M.Init()

  expect(M.isInit()).toEqual(true)
})
