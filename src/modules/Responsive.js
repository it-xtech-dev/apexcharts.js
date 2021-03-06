import Config from './settings/Config'
import Utils from '../utils/Utils'
import CoreUtils from './CoreUtils'

/**
 * ApexCharts Responsive Class to override options for different screen sizes.
 *
 * @module Responsive
 **/

export default class Responsive {
  constructor(ctx) {
    this.ctx = ctx
    this.w = ctx.w
  }

  // the opts parameter if not null has to be set overriding everything
  // as the opts is set by user externally

  /**
   * Applies options according to responsive settings.
   * @param {*} opts - the options to be applied.
   */
  applyResponsiveConfig(opts) {
    // this method can be execute in two contexts:
    // 1. Create new chart (opts are passed empty)
    // 2. Update existing chart (opts are passed respecively to .update method)

    const w = this.w
    const cnf = w.config

    // check if responsive config exists
    if (!cnf.responsive || cnf.responsive.length === 0) return

    // get chart container current size.
    var checkpoint = Utils.getDimensions(this.ctx.el)

    // choose rules that match current checkpoint.
    let matchedQueries = cnf.responsive
      // ensure all rule will have boundaries (event when not defined)
      .map((query) => {
        query.minWidth = query.minWidth || 0
        query.maxWidth = query.maxWidth || 8192
        query.minHeight = query.minHeight || 0
        query.maxHeight = query.maxHeight || 8192

        return query
      })
      // filter only matching queries
      .filter(
        (query) =>
          checkpoint.width > query.minWidth &&
          checkpoint.width <= query.maxWidth &&
          checkpoint.height > query.minHeight &&
          checkpoint.height <= query.maxHeight
      )

    // DEBUG ONLY
    // matchedQueries.map((query) => console.log(query))

    // PK: Dont fully undestand previous implementation options extending "magic" but belive i have simlified it well.
    let config = Utils.clone(w.globals.initialConfig)

    for (let i = 0; i < matchedQueries.length; i++) {
      // matched rules are applied in order there where specified iniside .responsive section.
      config = Utils.mergeDeep(
        config,
        CoreUtils.normalizeOptions(matchedQueries[i].options)
      )
    }

    this.w.config = new Config(config).init()
  }
}
