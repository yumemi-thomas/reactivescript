import { Array, Option, Schema } from 'effect'
import { Command, Runtime, type Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Help from './help'
import * as Issues from './issues'
import * as Settings from './settings'

// MODEL

export const Page = defineTaggedUnion({
  IssuesPage: { pageId: Schema.Number, issues: Issues.Model },
  HelpPage: { pageId: Schema.Number, help: Help.Model },
  SettingsPage: { pageId: Schema.Number, settings: Settings.Model },
})
export type Page = typeof Page.Type

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const OrphanClose = Schema.Struct({
  pageId: Schema.Number,
  operationId: Schema.Number,
})
export type OrphanClose = typeof OrphanClose.Type

export const Model = Schema.Struct({
  page: Page,
  nextPageId: Schema.Number,
  maybeOpenCount: Schema.Option(Schema.Number),
  orphanCloses: Schema.Array(OrphanClose),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },
  GotIssuesMessage: { pageId: Schema.Number, message: Issues.Message },
  GotHelpMessage: { pageId: Schema.Number, message: Help.Message },
  GotSettingsMessage: { pageId: Schema.Number, message: Settings.Message },
})
export type Message = typeof Message.Type

// INIT

type UpdateReturn = Update.Return<Model, Message>

const toIssuesMessage =
  (pageId: number) =>
  (message: Issues.Message): Message =>
    Message.GotIssuesMessage({ pageId, message })

const toHelpMessage =
  (pageId: number) =>
  (message: Help.Message): Message =>
    Message.GotHelpMessage({ pageId, message })

const toSettingsMessage =
  (pageId: number) =>
  (message: Settings.Message): Message =>
    Message.GotSettingsMessage({ pageId, message })

const withOpenCount = (model: Model, issues: Issues.Model): Model =>
  Option.match(Issues.maybeOpenCount(issues), {
    onNone: () => model,
    onSome: count =>
      modifyFields(model, {
        maybeOpenCount: () => Option.some(count),
        orphanCloses: () => [],
      }),
  })

const openIssuesPage = (model: Model): UpdateReturn => {
  const pageId = model.nextPageId
  const issuesInit = Issues.init()
  return {
    model: modifyFields(model, {
      nextPageId: nextPageId => nextPageId + 1,
      page: () => Page.IssuesPage({ pageId, issues: issuesInit.model }),
    }),
    commands: Command.mapMessages(issuesInit.commands, toIssuesMessage(pageId)),
  }
}

const openHelpPage = (
  model: Model,
  helpInit: Update.Return<Help.Model, Help.Message>,
): UpdateReturn => {
  const pageId = model.nextPageId
  return {
    model: modifyFields(model, {
      nextPageId: nextPageId => nextPageId + 1,
      page: () => Page.HelpPage({ pageId, help: helpInit.model }),
    }),
    commands: Command.mapMessages(helpInit.commands, toHelpMessage(pageId)),
  }
}

const openSettingsPage = (model: Model): UpdateReturn => {
  const pageId = model.nextPageId
  const settingsInit = Settings.init()
  return {
    model: modifyFields(model, {
      nextPageId: nextPageId => nextPageId + 1,
      page: () => Page.SettingsPage({ pageId, settings: settingsInit.model }),
    }),
    commands: Command.mapMessages(
      settingsInit.commands,
      toSettingsMessage(pageId),
    ),
  }
}

export const init: Runtime.ApplicationInit<Model, Message> = () => {
  const pageId = 0
  const issuesInit = Issues.init()
  return {
    model: {
      page: Page.IssuesPage({ pageId, issues: issuesInit.model }),
      nextPageId: pageId + 1,
      maybeOpenCount: Option.none(),
      orphanCloses: [],
    },
    commands: Command.mapMessages(issuesInit.commands, toIssuesMessage(pageId)),
  }
}

// UPDATE

const currentTab = (page: Page): Tab =>
  Page.match<Tab>(page, {
    IssuesPage: () => 'issues',
    HelpPage: () => 'help',
    SettingsPage: () => 'settings',
  })

const leavePage = (model: Model): Model =>
  Page.match(model.page, {
    IssuesPage: ({ pageId, issues }) =>
      modifyFields(model, {
        orphanCloses: orphanCloses => [
          ...orphanCloses,
          ...Array.map(
            Issues.countedCloseOperationIds(issues),
            operationId => ({ pageId, operationId }),
          ),
        ],
      }),
    HelpPage: () => model,
    SettingsPage: () => model,
  })

const isOrphanClose =
  (pageId: number, operationId: number) =>
  (orphan: OrphanClose): boolean =>
    orphan.pageId === pageId && orphan.operationId === operationId

const settleOrphanClose = (
  model: Model,
  pageId: number,
  message: Issues.Message,
): UpdateReturn => {
  if (
    message._tag !== 'SucceededCloseIssue' &&
    message._tag !== 'FailedCloseIssue'
  ) {
    return { model }
  }
  const isOrphan = isOrphanClose(pageId, message.operationId)
  if (!Array.some(model.orphanCloses, isOrphan)) {
    return { model }
  }
  const settledModel = modifyFields(model, {
    orphanCloses: Array.filter(orphan => !isOrphan(orphan)),
  })
  return {
    model:
      message._tag === 'FailedCloseIssue'
        ? modifyFields(settledModel, {
            maybeOpenCount: Option.map(count => count + 1),
          })
        : settledModel,
  }
}

const updateIssues = (
  model: Model,
  pageId: number,
  message: Issues.Message,
): UpdateReturn => {
  if (model.page._tag !== 'IssuesPage' || model.page.pageId !== pageId) {
    return settleOrphanClose(model, pageId, message)
  }
  const issuesUpdate = Issues.update(model.page.issues, message)
  const commands = Command.mapMessages(
    issuesUpdate.commands,
    toIssuesMessage(pageId),
  )
  const nextModel = withOpenCount(
    modifyFields(model, {
      page: () => Page.IssuesPage({ pageId, issues: issuesUpdate.model }),
    }),
    issuesUpdate.model,
  )
  if (issuesUpdate.outMessage === undefined) {
    return { model: nextModel, commands }
  }
  return Issues.OutMessage.match(issuesUpdate.outMessage, {
    OpenedRelatedHit: ({ query, hits, hitId }) => {
      const helpOpen = openHelpPage(
        leavePage(nextModel),
        Help.initWithHit(query, hits, hitId),
      )
      return {
        model: helpOpen.model,
        commands: [...commands, ...(helpOpen.commands ?? [])],
      }
    },
  })
}

const updateHelp = (
  model: Model,
  pageId: number,
  message: Help.Message,
): UpdateReturn => {
  if (model.page._tag !== 'HelpPage' || model.page.pageId !== pageId) {
    return { model }
  }
  const helpUpdate = Help.update(model.page.help, message)
  return {
    model: modifyFields(model, {
      page: () => Page.HelpPage({ pageId, help: helpUpdate.model }),
    }),
    commands: Command.mapMessages(helpUpdate.commands, toHelpMessage(pageId)),
  }
}

const updateSettings = (
  model: Model,
  pageId: number,
  message: Settings.Message,
): UpdateReturn => {
  if (model.page._tag !== 'SettingsPage' || model.page.pageId !== pageId) {
    return { model }
  }
  const settingsUpdate = Settings.update(model.page.settings, message)
  return {
    model: modifyFields(model, {
      page: () =>
        Page.SettingsPage({ pageId, settings: settingsUpdate.model }),
    }),
    commands: Command.mapMessages(
      settingsUpdate.commands,
      toSettingsMessage(pageId),
    ),
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => {
      if (tab === currentTab(model.page)) {
        return { model }
      }
      const leftModel = leavePage(model)
      if (tab === 'issues') {
        return openIssuesPage(leftModel)
      }
      if (tab === 'help') {
        return openHelpPage(leftModel, Help.init())
      }
      return openSettingsPage(leftModel)
    },
    GotIssuesMessage: ({ pageId, message }) =>
      updateIssues(model, pageId, message),
    GotHelpMessage: ({ pageId, message }) =>
      updateHelp(model, pageId, message),
    GotSettingsMessage: ({ pageId, message }) =>
      updateSettings(model, pageId, message),
  })

// VIEW

const tabLabel = (model: Model, tab: Tab): string => {
  if (tab === 'issues') {
    return Option.match(model.maybeOpenCount, {
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

const pageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Page.match(model.page, {
    IssuesPage: ({ pageId, issues }) =>
      h.submodel({
        slotId: `issues-${pageId}`,
        model: issues,
        view: Issues.view,
        toParentMessage: toIssuesMessage(pageId),
      }),
    HelpPage: ({ pageId, help }) =>
      h.submodel({
        slotId: `help-${pageId}`,
        model: help,
        view: Help.view,
        toParentMessage: toHelpMessage(pageId),
      }),
    SettingsPage: ({ pageId, settings }) =>
      h.submodel({
        slotId: `settings-${pageId}`,
        model: settings,
        view: Settings.view,
        toParentMessage: toSettingsMessage(pageId),
      }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('desk')],
    [
      h.nav(
        [h.Class('tabs'), h.Role('tablist'), h.AriaLabel('Pages')],
        [
          tabButton(model, 'issues', h),
          tabButton(model, 'help', h),
          tabButton(model, 'settings', h),
        ],
      ),
      h.main([h.Class('page')], [pageView(model, h)]),
    ],
  ),
})
