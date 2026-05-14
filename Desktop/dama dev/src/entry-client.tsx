import { createStartHandler } from '@tanstack/react-start/client'
import { getRouter } from './router'

const router = getRouter()

createStartHandler({
  router,
})()
