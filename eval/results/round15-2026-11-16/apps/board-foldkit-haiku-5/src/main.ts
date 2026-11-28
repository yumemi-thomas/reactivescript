import { Runtime } from 'foldkit'

import { Message } from './message'
import { Model, boardPageFor } from './model'
import { boardFetches, update } from './update'
import { view } from './view'

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { page: boardPageFor(0), nextVisit: 1 },
  commands: boardFetches(0),
})

export { Message, Model, update, view }
