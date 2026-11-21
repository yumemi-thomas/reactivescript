import { Runtime } from 'foldkit'

import { boardCommands, freshBoard } from './board'
import { Message } from './message'
import { Model, Page } from './model'
import { update } from './update'
import { view } from './view'

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { visit: 1, page: Page.Board({ board: freshBoard() }) },
  commands: boardCommands(1),
})

export { Message, Model, update, view }
