import { Match, Option, Schema } from 'effect'
import { Runtime, Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Help from './help'
import * as Issues from './issues'
import * as Settings from './settings'
import { TestId } from './testId'

// MODEL

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const Page = defineTaggedUnion({
  IssuesPage: { issues: Issues.Model },
  HelpPage: { help: Help.Model },
  SettingsPage: { settings: Settings.Model },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  pageEpoch: Schema.Number,
  page: Page,
  maybeOpenIssueCount: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },
  GotIssuesMessage: { pageEpoch: Schema.Number, message: Issues.Message },
  GotHelpMessage: { pageEpoch: Schema.Number, message: Help.Message },
  GotSettingsMessage: { pageEpoch: Schema.Number, message: Settings.Message },
})
export type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

// INIT

const toIssuesMessage = (pageEpoch: number) => (message: Issues.Message) =>
  Message.GotIssuesMessage({ pageEpoch, message })

const toHelpMessage = (pageEpoch: number) => (message: Help.Message) =>
  Message.GotHelpMessage({ pageEpoch, message })

const toSettingsMessage = (pageEpoch: number) => (message: Settings.Message) =>
  Message.GotSettingsMessage({ pageEpoch, message })

const openIssuesPage = (
  pageEpoch: number,
  maybeOpenIssueCount: Option.Option<number>,
): UpdateReturn =>
  Update.foldChildInit(Issues.init(), {
    toParentModel: (issues): Model => ({
      pageEpoch,
      page: Page.IssuesPage({ issues }),
      maybeOpenIssueCount,
    }),
    toParentMessage: toIssuesMessage(pageEpoch),
  })

const openHelpPage = (
  pageEpoch: number,
  maybeOpenIssueCount: Option.Option<number>,
  helpInit: Update.Return<Help.Model, Help.Message>,
): UpdateReturn =>
  Update.foldChildInit(helpInit, {
    toParentModel: (help): Model => ({
      pageEpoch,
      page: Page.HelpPage({ help }),
      maybeOpenIssueCount,
    }),
    toParentMessage: toHelpMessage(pageEpoch),
  })

const openSettingsPage = (
  pageEpoch: number,
  maybeOpenIssueCount: Option.Option<number>,
): UpdateReturn =>
  Update.foldChildInit(Settings.init(), {
    toParentModel: (settings): Model => ({
      pageEpoch,
      page: Page.SettingsPage({ settings }),
      maybeOpenIssueCount,
    }),
    toParentMessage: toSettingsMessage(pageEpoch),
  })

export const init: Runtime.ApplicationInit<Model, Message> = () =>
  openIssuesPage(0, Option.none())

// UPDATE

const currentTab = (page: Page): Tab =>
  Page.match(page, {
    IssuesPage: (): Tab => 'issues',
    HelpPage: (): Tab => 'help',
    SettingsPage: (): Tab => 'settings',
  })

const withOpenIssueCount = (model: Model): Model =>
  Page.match(model.page, {
    IssuesPage: ({ issues }) =>
      modifyFields(model, {
        maybeOpenIssueCount: current =>
          Option.orElse(Issues.openIssueCount(issues), () => current),
      }),
    HelpPage: () => model,
    SettingsPage: () => model,
  })

const foldIssues = Update.foldChildAt({
  update: Issues.update,
  readAt: (model: Model, pageEpoch: number) =>
    model.pageEpoch === pageEpoch && model.page._tag === 'IssuesPage'
      ? Option.some(model.page.issues)
      : Option.none(),
  writeAt: (model: Model, _pageEpoch: number, issues: Issues.Model) =>
    withOpenIssueCount(
      modifyFields(model, { page: (): Page => Page.IssuesPage({ issues }) }),
    ),
  toParentMessage: (pageEpoch, message) =>
    Message.GotIssuesMessage({ pageEpoch, message }),
  foldOutMessage: () =>
    Issues.OutMessage.match({
      OpenedRelatedHelp:
        ({ query, hits, hitId }) =>
        (stepModel: Model): UpdateReturn =>
          openHelpPage(
            stepModel.pageEpoch + 1,
            stepModel.maybeOpenIssueCount,
            Help.initWithHit(query, hits, hitId),
          ),
    }),
})

const foldHelp = Update.foldChildAt({
  update: Help.update,
  readAt: (model: Model, pageEpoch: number) =>
    model.pageEpoch === pageEpoch && model.page._tag === 'HelpPage'
      ? Option.some(model.page.help)
      : Option.none(),
  writeAt: (model: Model, _pageEpoch: number, help: Help.Model) =>
    modifyFields(model, { page: (): Page => Page.HelpPage({ help }) }),
  toParentMessage: (pageEpoch, message) =>
    Message.GotHelpMessage({ pageEpoch, message }),
})

const foldSettings = Update.foldChildAt({
  update: Settings.update,
  readAt: (model: Model, pageEpoch: number) =>
    model.pageEpoch === pageEpoch && model.page._tag === 'SettingsPage'
      ? Option.some(model.page.settings)
      : Option.none(),
  writeAt: (model: Model, _pageEpoch: number, settings: Settings.Model) =>
    modifyFields(model, { page: (): Page => Page.SettingsPage({ settings }) }),
  toParentMessage: (pageEpoch, message) =>
    Message.GotSettingsMessage({ pageEpoch, message }),
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => {
      if (tab === currentTab(model.page)) {
        return { model }
      }
      const pageEpoch = model.pageEpoch + 1
      return Match.value(tab).pipe(
        Match.withReturnType<UpdateReturn>(),
        Match.when('issues', () =>
          openIssuesPage(pageEpoch, model.maybeOpenIssueCount),
        ),
        Match.when('help', () =>
          openHelpPage(pageEpoch, model.maybeOpenIssueCount, Help.init()),
        ),
        Match.when('settings', () =>
          openSettingsPage(pageEpoch, model.maybeOpenIssueCount),
        ),
        Match.exhaustive,
      )
    },

    GotIssuesMessage: ({ pageEpoch, message }) =>
      foldIssues(model, pageEpoch, message),

    GotHelpMessage: ({ pageEpoch, message }) =>
      foldHelp(model, pageEpoch, message),

    GotSettingsMessage: ({ pageEpoch, message }) =>
      foldSettings(model, pageEpoch, message),
  })

// VIEW

const STYLESHEET = `
.app { font-family: system-ui, sans-serif; max-width: 72rem; margin: 0 auto; padding: 1rem; color: #1f2328; }
.tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid #d0d7de; padding-bottom: 0.5rem; margin-bottom: 1rem; }
.tabs button[aria-current='page'] { font-weight: 600; }
button { font: inherit; cursor: pointer; }
input { font: inherit; }
.toolbar, .inline-form, .actions, .filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
.filters button[aria-pressed='true'] { font-weight: 600; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1.5rem; }
.issue-list, .hits, .comments ul, .labels ul, .related ul { list-style: none; padding: 0; margin: 0; }
.issue-row { display: flex; gap: 0.5rem; align-items: center; margin: 0.25rem 0; }
.issue { flex: 1; text-align: left; }
.issue[aria-current='true'] { font-weight: 600; }
.label-row { display: inline-flex; gap: 0.25rem; align-items: center; margin-right: 0.75rem; }
.pending { opacity: 0.6; }
.error { color: #b42318; }
`

const issuesTabLabel = (model: Model): string =>
  Option.match(model.maybeOpenIssueCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })

const tabButton = (
  tab: Tab,
  label: string,
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      TestId(`tab-${tab}`),
      h.Type('button'),
      h.AriaCurrent(currentTab(model.page) === tab ? 'page' : 'false'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [label],
  )

const pageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Page.match(model.page, {
    IssuesPage: ({ issues }) =>
      h.submodel({
        slotId: `issues-${model.pageEpoch}`,
        model: issues,
        view: Issues.view,
        toParentMessage: toIssuesMessage(model.pageEpoch),
      }),
    HelpPage: ({ help }) =>
      h.submodel({
        slotId: `help-${model.pageEpoch}`,
        model: help,
        view: Help.view,
        toParentMessage: toHelpMessage(model.pageEpoch),
      }),
    SettingsPage: ({ settings }) =>
      h.submodel({
        slotId: `settings-${model.pageEpoch}`,
        model: settings,
        view: Settings.view,
        toParentMessage: toSettingsMessage(model.pageEpoch),
      }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('app')],
    [
      h.style([], [STYLESHEET]),
      h.nav(
        [h.Class('tabs'), h.AriaLabel('Pages')],
        [
          tabButton('issues', issuesTabLabel(model), model, h),
          tabButton('help', 'Help', model, h),
          tabButton('settings', 'Settings', model, h),
        ],
      ),
      h.main([], [pageView(model, h)]),
    ],
  ),
})
