import { Match, Option, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Help from './help'
import * as Issues from './issues'
import * as Settings from './settings'
import { STYLES } from './styles'

// MODEL

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const Page = defineTaggedUnion({
  Issues: { instance: Schema.Number, page: Issues.Model },
  Help: { instance: Schema.Number, page: Help.Model },
  Settings: { instance: Schema.Number, page: Settings.Model },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  page: Page,
  nextInstance: Schema.Number,
  maybeOpenIssueCount: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },
  GotIssuesMessage: { instance: Schema.Number, message: Issues.Message },
  GotHelpMessage: { instance: Schema.Number, message: Help.Message },
  GotSettingsMessage: { instance: Schema.Number, message: Settings.Message },
})
export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const openIssuesPage = (model: Model): UpdateReturn => {
  const instance = model.nextInstance
  const issuesInit = Issues.init()
  return {
    model: modifyFields(model, {
      nextInstance: () => instance + 1,
      page: () => Page.Issues({ instance, page: issuesInit.model }),
    }),
    commands: Command.mapMessages(issuesInit.commands, message =>
      Message.GotIssuesMessage({ instance, message }),
    ),
  }
}

const enterHelpPage = (
  model: Model,
  helpInit: Update.Return<Help.Model, Help.Message>,
): UpdateReturn => {
  const instance = model.nextInstance
  return {
    model: modifyFields(model, {
      nextInstance: () => instance + 1,
      page: () => Page.Help({ instance, page: helpInit.model }),
    }),
    commands: Command.mapMessages(helpInit.commands, message =>
      Message.GotHelpMessage({ instance, message }),
    ),
  }
}

const openSettingsPage = (model: Model): UpdateReturn => {
  const instance = model.nextInstance
  const settingsInit = Settings.init()
  return {
    model: modifyFields(model, {
      nextInstance: () => instance + 1,
      page: () => Page.Settings({ instance, page: settingsInit.model }),
    }),
    commands: Command.mapMessages(settingsInit.commands, message =>
      Message.GotSettingsMessage({ instance, message }),
    ),
  }
}

const currentTab = (page: Page): Tab =>
  Page.match<Tab>(page, {
    Issues: () => 'issues',
    Help: () => 'help',
    Settings: () => 'settings',
  })

const foldIssuesOutMessage = (
  model: Model,
  outMessage: Issues.OutMessage,
): UpdateReturn =>
  Issues.OutMessage.match<UpdateReturn>(outMessage, {
    OpenedRelatedHelp: ({ query, hits, hitId }) =>
      enterHelpPage(model, Help.initWithSelectedHit(query, hits, hitId)),
    RestoredClosedIssue: () => ({
      model: modifyFields(model, {
        maybeOpenIssueCount: Option.map(count => count + 1),
      }),
    }),
  })

const foldIssues = (
  model: Model,
  instance: number,
  message: Issues.Message,
): UpdateReturn => {
  if (model.page._tag !== 'Issues' || model.page.instance !== instance) {
    return { model }
  }
  const issuesUpdate = Issues.update(model.page.page, message)
  const maybeCount = Issues.openIssueCount(issuesUpdate.model)
  const written = modifyFields(model, {
    page: () => Page.Issues({ instance, page: issuesUpdate.model }),
    maybeOpenIssueCount: maybeOpenIssueCount =>
      Option.orElse(maybeCount, () => maybeOpenIssueCount),
  })
  const issuesCommands = Command.mapMessages(
    issuesUpdate.commands,
    childMessage => Message.GotIssuesMessage({ instance, message: childMessage }),
  )
  if (issuesUpdate.outMessage === undefined) {
    return { model: written, commands: issuesCommands }
  }
  const outMessageFold = foldIssuesOutMessage(written, issuesUpdate.outMessage)
  return {
    model: outMessageFold.model,
    commands: [...issuesCommands, ...(outMessageFold.commands ?? [])],
  }
}

const foldHelp = (
  model: Model,
  instance: number,
  message: Help.Message,
): UpdateReturn => {
  if (model.page._tag !== 'Help' || model.page.instance !== instance) {
    return { model }
  }
  const helpUpdate = Help.update(model.page.page, message)
  return {
    model: modifyFields(model, {
      page: () => Page.Help({ instance, page: helpUpdate.model }),
    }),
    commands: Command.mapMessages(helpUpdate.commands, childMessage =>
      Message.GotHelpMessage({ instance, message: childMessage }),
    ),
  }
}

const foldSettings = (
  model: Model,
  instance: number,
  message: Settings.Message,
): UpdateReturn => {
  if (model.page._tag !== 'Settings' || model.page.instance !== instance) {
    return { model }
  }
  const settingsUpdate = Settings.update(model.page.page, message)
  return {
    model: modifyFields(model, {
      page: () => Page.Settings({ instance, page: settingsUpdate.model }),
    }),
    commands: Command.mapMessages(settingsUpdate.commands, childMessage =>
      Message.GotSettingsMessage({ instance, message: childMessage }),
    ),
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => {
      if (tab === currentTab(model.page)) {
        return { model }
      }
      return openTab(model, tab)
    },
    GotIssuesMessage: ({ instance, message: issuesMessage }) =>
      foldIssues(model, instance, issuesMessage),
    GotHelpMessage: ({ instance, message: helpMessage }) =>
      foldHelp(model, instance, helpMessage),
    GotSettingsMessage: ({ instance, message: settingsMessage }) =>
      foldSettings(model, instance, settingsMessage),
  })

const openTab = (model: Model, tab: Tab): UpdateReturn =>
  Match.value(tab).pipe(
    Match.when('issues', () => openIssuesPage(model)),
    Match.when('help', () => enterHelpPage(model, Help.init())),
    Match.when('settings', () => openSettingsPage(model)),
    Match.exhaustive,
  )

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const instance = 0
  const issuesInit = Issues.init()
  return {
    model: {
      page: Page.Issues({ instance, page: issuesInit.model }),
      nextInstance: instance + 1,
      maybeOpenIssueCount: Option.none(),
    },
    commands: Command.mapMessages(issuesInit.commands, message =>
      Message.GotIssuesMessage({ instance, message }),
    ),
  }
}

// VIEW

const tabLabel = (model: Model, tab: Tab): string => {
  if (tab === 'issues') {
    return Option.match(model.maybeOpenIssueCount, {
      onNone: () => 'Issues',
      onSome: count => `Issues (${count})`,
    })
  }
  return tab === 'help' ? 'Help' : 'Settings'
}

const tabButton = (model: Model, tab: Tab, h: HtmlBuilder<Message>): Html => {
  const isCurrent = currentTab(model.page) === tab
  return h.button(
    [
      h.DataAttribute('testid', `tab-${tab}`),
      h.Type('button'),
      h.Role('tab'),
      h.AriaSelected(isCurrent),
      h.Class(isCurrent ? 'tab current' : 'tab'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [tabLabel(model, tab)],
  )
}

const pageView = (page: Page, h: HtmlBuilder<Message>): Html =>
  Page.match(page, {
    Issues: ({ instance, page: issuesPage }) =>
      h.submodel({
        slotId: `issues-${instance}`,
        model: issuesPage,
        view: Issues.view,
        toParentMessage: message =>
          Message.GotIssuesMessage({ instance, message }),
      }),
    Help: ({ instance, page: helpPage }) =>
      h.submodel({
        slotId: `help-${instance}`,
        model: helpPage,
        view: Help.view,
        toParentMessage: message => Message.GotHelpMessage({ instance, message }),
      }),
    Settings: ({ instance, page: settingsPage }) =>
      h.submodel({
        slotId: `settings-${instance}`,
        model: settingsPage,
        view: Settings.view,
        toParentMessage: message =>
          Message.GotSettingsMessage({ instance, message }),
      }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('desk')],
    [
      h.style([], [STYLES]),
      h.nav(
        [h.Class('tabs'), h.Role('tablist'), h.AriaLabel('Pages')],
        [
          tabButton(model, 'issues', h),
          tabButton(model, 'help', h),
          tabButton(model, 'settings', h),
        ],
      ),
      h.main([h.Class('page'), h.Role('tabpanel')], [pageView(model.page, h)]),
    ],
  ),
})
