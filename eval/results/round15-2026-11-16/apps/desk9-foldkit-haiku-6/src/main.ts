import { Option } from 'effect'
import { type Runtime } from 'foldkit'

import { Message } from './message.js'
import { Model } from './model.js'
import { startPage, update } from './update.js'
import { view } from './view.js'

export { Message, Model, update, view }

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const started = startPage('IssuesPage', 1, Option.none())
  const model = {
    visit: 1,
    page: started.model,
    lastOpenCount: Option.none(),
  }
  return started.commands ? { model, commands: started.commands } : { model }
}
