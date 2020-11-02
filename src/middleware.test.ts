import { Request, Response, NextFunction } from 'express'
import { Span, Tags } from 'opentracing'
import Rewire from 'rewire'
import Main from '.'
import { middleware } from './middlewares'

const { Init } = Main

const mockRequest = () => {
  return {
    headers: {},
    get: jest.fn().mockReturnValue(''),
    opentracing: {},
  } as unknown as Request
}

const mockResponse = () => {
  const res = {
    on: jest.fn(),
  } as unknown as Response
  return res
}

test('Middleware should throw error when no tracer initialized', () => {
  const fn = () => middleware()
  expect(fn).toThrowError('You have to set `Init()` before using the middleware')
})

test('Middleware should return valid express middleware', () => {

  Init({
    tracer: {
      config: {
        serviceName: 'test',
      },
    },
  })

  const fn = middleware()
  const mockedNext = jest.fn()
  const res = mockResponse()

  fn(mockRequest(), res, mockedNext)

  expect(mockedNext).toHaveBeenCalled()
  expect(res.on).toHaveBeenCalledWith('finish', expect.anything())
})

test('makeFinish should able to set state span finished', () => {
  const m = Rewire('./middlewares')
  const makeFinish = m.__get__('makeFinish')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  makeFinish(mockSpan, {}, { statusCode: 200 })()

  expect(mockSpan.finish).toHaveBeenCalled()
  expect(mockSpan.setTag).toHaveBeenCalledWith(Tags.HTTP_STATUS_CODE, 200)
  expect(mockSpan.log).toHaveBeenCalledWith({
    event: 'request_ended',
  })
})

test('makeFinish should able to set error state span', () => {
  const m = Rewire('./middlewares')
  const makeFinish = m.__get__('makeFinish')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  makeFinish(mockSpan, {}, {
    statusCode: m.__get__('ERR_STATUS_CODE'),
    statusMessage: 'Bad Request',
  }, () => true)()

  expect(mockSpan.setTag).toHaveBeenNthCalledWith(1, Tags.SAMPLING_PRIORITY, 1)
  expect(mockSpan.setTag).toHaveBeenNthCalledWith(2, Tags.ERROR, true)
  expect(mockSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.status_message',
    message: 'Bad Request',
  })
})

test('Error middleware should able to wrap within error middleware', () => {
  const { errMiddlewareWrapper } = jest.requireActual('./middlewares')
  jest.spyOn(Main, 'isInit').mockReturnValue(true)

  const err = new Error('test')
  const mockedRes = mockResponse()
  const mockedNext = jest.fn()
  const mockedSpan: any = Object.assign(Object.create(Span.prototype), { // mocking "instanceof" object
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  })

  const mockedReq = {
    opentracing: {
      span: mockedSpan,
    },
  }

  const errImplFn = jest.fn()
  errMiddlewareWrapper(errImplFn)(err, mockedReq, mockedRes, mockedNext as unknown as NextFunction)

  expect(errImplFn).toBeCalled()
  expect(errImplFn).toHaveBeenCalledWith(err, mockedReq, mockedRes, mockedNext)
  expect(mockedSpan.setTag).toHaveBeenCalledTimes(2)
  expect(mockedSpan.setTag).toHaveBeenNthCalledWith(1, Tags.SAMPLING_PRIORITY, 1)
  expect(mockedSpan.setTag).toHaveBeenNthCalledWith(2, Tags.ERROR, true)
  expect(mockedSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.message',
    message: err.message,
  })
  expect(mockedSpan.log).toHaveBeenNthCalledWith(2, {
    event: 'request_ended',
  })
  expect(mockedSpan.finish).toHaveBeenCalled()
})
