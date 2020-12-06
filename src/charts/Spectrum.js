import Graphics from '../modules/Graphics'
import Utils from '../utils/Utils'
import DateTime from '../utils/DateTime'

/**
 * ApexCharts HeatMap Class.
 * @module Spectrum
 **/

export default class Spectrum {
  constructor(ctx) {
    this.ctx = ctx
    this.w = ctx.w
    this.dateHelper = new DateTime(this.ctx)
    this.drawnBlocks = []
    this.dataPointTooltip = null
    this.canvasDrawing = null
    // get axis configuration (how many time units will be visible at horizontal and vertical axis)
    this.axesConfig = this.getAxesConifg()
  }

  draw(series) {
    var self = this

    var effectiveSeries = series.map((serie, index) => {
      return serie.length > 0 ? this.w.config.series[index] : []
    })

    //this.processAxes(series);

    let w = this.w
    const graphics = new Graphics(this.ctx)

    let ret = graphics.group({
      class: 'apexcharts-spectrum'
    })

    ret.attr('clip-path', `url(#gridRectMask${w.globals.cuid})`)

    // Preparing canvas element that will hold spectrum series.
    // Canvas has to be positioned relative to chart container (outside of svg) because IE11 lacks support for <foreignobject></foreignobject> which is native way to put html elements iniside svg.
    // get chart container.
    var chartContainer = document.querySelector(w.globals.chartClass)

    // get canvas offset relative to chart container
    var canvasRelativePosition = {
      left: w.globals.translateX,
      top: w.globals.translateY
    }

    // add the canvas and set its dimensions according to chart draw area.
    var canvas = document.createElement('canvas')
    canvas.setAttribute(
      'style',
      'top:' +
        canvasRelativePosition.top +
        'px;left:' +
        canvasRelativePosition.left +
        'px;width:' +
        w.globals.gridWidth +
        'px;height:' +
        w.globals.gridHeight +
        'px;'
    )
    // set canvas dimensions
    canvas.width = w.globals.gridWidth
    canvas.height = w.globals.gridHeight

    // handle tooltips over the canvas
    // custom tooltip class is used here
    // when mouse moves over the canvas update tooltip text and position
    canvas.addEventListener('mousemove', function(e) {
      var rect = e.target.getBoundingClientRect()
      self.hoverAction(e.clientX - rect.left, e.clientY - rect.top)
    })
    // when mouse leaves the canvas hide tooltip
    canvas.addEventListener('mouseleave', function(e) {
      self.dataPointTooltip.isVisible = false
      if (self.tooltipBlockContext)
        self.redrawDataPoint(self.tooltipBlockContext.dataPoint, false)
    })

    // initialize this chart instance datapoint tooltip
    this.dataPointTooltip = new DataPointToolTip(this.ctx)

    // append canvas to dom
    chartContainer.appendChild(canvas)

    // get canvas obeject to perform drawing
    this.canvasDrawing = canvas.getContext('2d')

    // caculate how many pixels are per 1% unit (for drawing simplicity using percent units to draw shapes)
    this.canvasXFactor = canvas.width / 100
    this.canvasYFactor = canvas.height / 100

    // perform blocks render
    var currentLine = 0
    var lineEndXPosition = 0

    // extract datapoints from multiple series (arrays) to single datapoints array with serie attribute for each datapoint
    var dataPoints = []
    effectiveSeries.forEach((serie, serieIndex) => {
      if (serie.data) {
        serie.data.forEach((dataPoint) => {
          dataPoints.push({
            start: dataPoint.start,
            end: dataPoint.end,
            serieIndex: serieIndex
          })
        })
      }
    })

    // sort datapoints ascending
    // WARNING: sorting ascending is essential for drawing algorythm
    dataPoints = dataPoints.sort((a, b) => a.start - b.start)

    // process each datapoint to draw its block on the chart
    dataPoints.forEach((dataPoint) => {
      // reduce datapoint coordinates relative to minimal value (starting point)
      // first coordinate in this case will be x = 0, y = 0
      var xStart = dataPoint.start - this.axesConfig.minValue
      var xEnd = dataPoint.end - this.axesConfig.minValue
      var blockWidth = xEnd - xStart

      if (blockWidth < 0) {
        console.error('Negative datapoint width:', dataPoint)
        throw 'Chart data corrupted: datapoint block width has negative value'
      }

      var lastDrawnBlock = this.drawnBlocks.slice(-1)[0]
      if (lastDrawnBlock && lastDrawnBlock.dataPoint.end > dataPoint.start) {
        console.error(
          'Datapoint Collision:',
          lastDrawnBlock.dataPoint,
          dataPoint
        )
        throw 'Unable to draw dataPoint block because it is colliding with previous block:'
      }

      //console.log('dataPoint.start', dataPoint.start.getTime())

      // continous datapoints (following one afters another) has to be splitted according to horizontal axis quantification
      // this vairable will hold current line boundary relative to 0,0 point.
      lineEndXPosition = this.axesConfig.xRange * (currentLine + 1)

      // increase current line if there are no block to draw in this line
      while (xStart > lineEndXPosition) {
        currentLine++
        lineEndXPosition = this.axesConfig.xRange * (currentLine + 1)
      }

      // because single datapoint block might exceed single row
      // it has to be splited into subblocks. Below array will hold those splitted blocks.
      var blocks = []

      // console.log('--new block--')
      // console.log({
      //   xStart: xStart,
      //   xEnd: xEnd
      // })
      // console.log('parsed:')

      if (xEnd <= lineEndXPosition) {
        // when whole block is contained into single line
        // push it to blocks array (it does not has to be splitted)
        blocks.push({
          xStart: xStart,
          xEnd: xEnd,
          line: currentLine
        })
      } else {
        // when block exceeds single line split block into multiple parts

        // push sub block that fits in current line
        blocks.push({
          xStart: xStart,
          xEnd: lineEndXPosition,
          line: currentLine
        })

        // calculate how many lines will occupy subblocks that remain after first line block subtraction
        var blockFirstLineWidth = lineEndXPosition - xStart
        var blockWidthWithoutFirstLine = blockWidth - blockFirstLineWidth
        var blockLinesOccupied =
          blockWidthWithoutFirstLine / this.axesConfig.xRange
        var blockLinesOccupiedCount = Math.floor(blockLinesOccupied)
        var blockLastLineWidth = Math.ceil(
          (blockLinesOccupied - blockLinesOccupiedCount) *
            this.axesConfig.xRange
        )

        // push all "full lines" as separate blocks
        for (var i = 0; i < blockLinesOccupiedCount; i++) {
          currentLine++
          var lineStartXPosition = this.axesConfig.xRange * currentLine + 1
          lineEndXPosition = this.axesConfig.xRange * (currentLine + 1)
          blocks.push({
            xStart: lineStartXPosition,
            xEnd: lineEndXPosition,
            line: currentLine
          })
        }

        // push reminder subblock if it is present
        if (blockLastLineWidth > 0) {
          currentLine++
          blocks.push({
            xStart: this.axesConfig.xRange * currentLine + 1,
            xEnd: this.axesConfig.xRange * currentLine + blockLastLineWidth,
            line: currentLine
          })
        }
      }

      // draw each block to the chart
      blocks.forEach((block) => {
        var drawnBlock = this.drawBlock(block, dataPoint)
        // once drawn push block into class level collection and save block-datapoint relation.
        this.drawnBlocks.push(drawnBlock)
      })

      //console.log('--block end--')
    })

    // console.log(this.drawnBlocks)

    let elSeries = graphics.group({
      class: `apexcharts-series apexcharts-spectrum-series`,
      seriesName: Utils.escapeString(w.globals.seriesNames[0]),
      rel: 1,
      'data:realIndex': 0
    })

    //elSeries.add(rect)

    ret.add(elSeries)

    return ret
  }

  /**
   * Draws data block into the chart.
   * @param {object} block - the block dimension in time units
   * @param {object} dataPoint - the original datapoint related with block
   */
  drawBlock(block, dataPoint) {
    // caculate chart relative blocks positions
    var xPosition =
      block.xStart / this.axesConfig.xRange -
      Math.floor(block.xStart / this.axesConfig.xRange)
    var blockWidth = block.xEnd - block.xStart

    // recalc positions and dimensions to percent value
    var xPositionPercent = 100 * xPosition
    var blockWidthPercent = (100 * blockWidth) / this.axesConfig.xRange
    var yPositionPercent = (100 * block.line) / this.axesConfig.yDivider
    var blockHeightPercent = 100 / this.axesConfig.yDivider

    // determine block fill style
    this.canvasDrawing.fillStyle = this.getSerieRgba(
      dataPoint.serieIndex,
      false
    )
    //'rgba(' + dataPoint.serieIndex * 100 + ', 0, 0)'

    // block dimension represented in screen dimensions
    // round to 3 places decimal places precision.
    var drawnBlock = {
      x: Math.round(xPositionPercent * this.canvasXFactor * 1000) / 1000,
      y: Math.round(yPositionPercent * this.canvasYFactor * 1000) / 1000,
      width: Math.round(blockWidthPercent * this.canvasXFactor * 1000) / 1000,
      height: Math.round(blockHeightPercent * this.canvasYFactor * 1000) / 1000,
      dataPoint: dataPoint
    }

    // draw block rectangle
    this.canvasDrawing.fillRect(
      drawnBlock.x,
      drawnBlock.y,
      drawnBlock.width,
      drawnBlock.height
    )

    // return drawn block info
    return drawnBlock
  }

  redrawDataPoint(dataPoint, withHighlight) {
    var blocks = this.drawnBlocks.filter(
      (b) => b.dataPoint.start === dataPoint.start
    )

    blocks.forEach((b) => {
      //console.log(b, withHighlight)

      this.canvasDrawing.fillStyle = this.getSerieRgba(
        dataPoint.serieIndex,
        withHighlight
      )

      this.canvasDrawing.clearRect(b.x, b.y, b.width, b.height)
      this.canvasDrawing.fillRect(b.x, b.y, b.width, b.height)
    })
  }

  getSerieRgba(serieIndex, withHighlight) {
    //this.w.series[serieIndex]
    //var serieColor = this.w.config.series[serieIndex]
    //var globalColor = this.w.globals.colors[serieIndex]
    var outPutColor = this.w.globals.colors[serieIndex]

    return Utils.hexToRgba(
      outPutColor,
      withHighlight ? 0.3 : this.w.config.fill.opacity
    )
  }

  // refactor function name / split to handle tooltip positioning an serie highlight
  hoverAction(xPosition, yPosition) {
    var hitTest = (block, xPosition, yPosition) => {
      return (
        xPosition >= block.x &&
        xPosition <= block.x + block.width &&
        yPosition >= block.y &&
        yPosition <= block.y + block.height
      )
    }
    var hoveredBlock = null

    if (
      this.tooltipBlockContext &&
      hitTest(this.tooltipBlockContext, xPosition, yPosition)
    ) {
      // block doesnt changed
      hoveredBlock = this.tooltipBlockContext
    } else {
      // another block selected or no block selected
      hoveredBlock = this.drawnBlocks.find((block) => {
        return hitTest(block, xPosition, yPosition)
      })
    }

    //console.log(xPosition, yPosition)

    if (this.tooltipBlockContext !== hoveredBlock) {
      // unhighlight recent block
      if (this.tooltipBlockContext)
        this.redrawDataPoint(this.tooltipBlockContext.dataPoint, false)

      if (hoveredBlock) {
        // highlight new block
        this.redrawDataPoint(hoveredBlock.dataPoint, true)
      }

      this.tooltipBlockContext = hoveredBlock

      //console.log('Tooltip position changed')
      //console.log(this.tooltipBlockContext.x, this.tooltipBlockContext.y)

      if (!this.tooltipBlockContext) {
        // when changed to empty (not matched) block hide tooltip.
        this.dataPointTooltip.isVisible = false
        return
      }

      this.dataPointTooltip.left = this.tooltipBlockContext.x
      this.dataPointTooltip.top = this.tooltipBlockContext.y
    }

    if (this.tooltipBlockContext) {
      this.dataPointTooltip.isVisible = true
      var htmlContent =
        this.dateHelper.formatDate(
          this.tooltipBlockContext.dataPoint.start,
          'yyyy-MM-dd hh:mm:ss'
        ) +
        '<br/>' +
        this.dateHelper.formatDate(
          this.tooltipBlockContext.dataPoint.end,
          'yyyy-MM-dd hh:mm:ss'
        )
      this.dataPointTooltip.content = htmlContent

      //console.log('Tooltip on:', this.tooltipBlockContext.dataPoint)
    }
  }

  /**
   * Calculates horizontal and vertial axis time dimensions according to series data
   * Tries to get optimal axis scale to represent data.
   */
  getAxesConifg() {
    var dataStartPoints = []
    var dataEndPoints = []

    //console.log(this.w.globals.initialSeries)
    //this.w.config.series

    this.w.globals.initialSeries.forEach((serie) => {
      serie.data.forEach((event) => {
        dataStartPoints.push(event.start)
        dataEndPoints.push(event.end)
      })
    })

    var minValue = Math.min.apply(null, dataStartPoints)
    var maxValue = Math.max.apply(null, dataEndPoints)

    //console.log(minValue)

    var milisecondsDiff = maxValue - minValue
    var secondsDiff = milisecondsDiff / 1000
    var minuteDiff = secondsDiff / 60
    var hourDiff = minuteDiff / 60
    var dayDiff = hourDiff / 60
    var resolutionMatrix = [
      1 * 60, // 1 min
      5 * 60, // 5 min
      10 * 60, // 10 min
      30 * 60, // 30 min
      1 * 60 * 60, // 1h
      6 * 60 * 60, // 6h
      12 * 60 * 60, // 12h
      24 * 60 * 60, // 24h
      48 * 60 * 60, // 2 days
      120 * 60 * 60, // 5 days
      240 * 60 * 60, // 10 days
      480 * 60 * 60, // 20 days
      720 * 60 * 60, // 30 days
      2160 * 60 * 60 // 90 days
    ]

    // number of miliseconds that fit into x axis
    var xRange
    // number of ticks (row) inside y axis
    var yDivider
    for (let i = 0; i < resolutionMatrix.length; i++) {
      xRange = resolutionMatrix[i]
      yDivider = Math.ceil(secondsDiff / xRange)
      if (yDivider <= 30) {
        break
      }
    }

    return {
      xRange: xRange * 1000,
      yDivider: yDivider,
      minValue: minValue,
      maxValue: maxValue
    }
  }

  /**
   * Initializes spectrum chart axes according to series data
   */
  initializeAxes() {
    this.w.config.xaxis.labels.show = false
    this.w.config.xaxis.axisTicks.show = false
    this.w.config.yaxis[0].reversed = true
    this.w.config.yaxis[0].axisBorder.show = true
    this.w.config.yaxis[0].axisTicks.show = true
    //this.w.config.yaxis[0].axisTicks.offsetY = -5

    var yUnits = []
    var labelFormat = 'yyyy-MM-dd HH:mm:ss'
    var minDate = new Date(this.axesConfig.minValue)
    var maxDate = new Date(this.axesConfig.maxValue)
    var f = (date, format) => this.dateHelper.formatDate(date, format)

    // determine shortest possible label format
    if (f(minDate, 'yyyy-MM-dd') === f(maxDate, 'yyyy-MM-dd')) {
      labelFormat = 'HH:mm:ss'
    } else if (f(minDate, 'yyyy') === f(maxDate, 'yyyy')) {
      labelFormat = 'd MM HH:mm:ss'
    }

    for (var i = 0; i <= this.axesConfig.yDivider; i++) {
      // calculate labels for y axis top -> down
      // calculation is base on absolute ms equation: startValue * step
      var startDate = new Date(
        this.axesConfig.minValue + i * this.axesConfig.xRange
      )
      var label = f(startDate, labelFormat)
      yUnits.push(label)
    }
    //yUnits.push('')

    var primaryYAxis = this.w.globals.yAxisScale[0]
    primaryYAxis.result = yUnits

    //get the longest string from the labels array and also apply label formatter to it
    let longest = yUnits.reduce(function(a, b) {
      return a.length > b.length ? a : b
    }, 0)

    primaryYAxis.niceMax = longest
    primaryYAxis.niceMin = longest
  }
}

/**
 * Represents datapoint tooltip
 */
class DataPointToolTip {
  constructor(chartContext) {
    var globals = chartContext.w.globals
    var toolTipContainer = document.querySelector(globals.chartClass)
    this.toolTipElement = document.createElement('div')
    this._isVisible = false
    this.isAutoShowEnabled = true
    this._content = ''
    this._top = 0
    this._left = 0
    this._topOffset = globals.translateY
    this._leftOffset = globals.translateX
    this.toolTipElement.setAttribute(
      'style',
      'position:absolute; z-index: 1; opacity: 1; overflow: visible;'
    )
    var classList = this.toolTipElement.classList
    classList.add('apexcharts-tooltip')
    classList.add('light')
    classList.add('apexcharts-heavy-hide')

    toolTipContainer.appendChild(this.toolTipElement)
  }

  /**
   * Sets tooltip visiblity. This property is reflected into UI.
   * @param {boolean} val
   */
  set isVisible(val) {
    if (this._isVisible != val) {
      this._isVisible = val
      var classList = this.toolTipElement.classList
      if (val === true) {
        classList.remove('apexcharts-heavy-hide')
      } else {
        classList.add('apexcharts-heavy-hide')
      }
    }
  }

  /**
   * Get information whether tooltip is currently visible
   */
  get isVisible() {
    return this._isVisible
  }

  /**
   * Sets tooltip top position. Setting this property will reflect UI tooltip position.
   * @param {number} val
   */
  set top(val) {
    if (this._top !== val) {
      this.triggerAutoVisible()
      if (this.isAutoShowEnabled === true) this.isVisible = true
      this._top = val
      // vertical offset to show tooltip above target position taking into account tooltip height
      var contentOffset = this.toolTipElement.clientHeight
      this.toolTipElement.style.top =
        this._topOffset + val - contentOffset + 'px'
    }
  }

  /**
   * Sets tooltip left position. Setting this property will reflect UI tooltip position.
   * @param {number} val
   */
  set left(val) {
    if (this._left !== val) {
      this.triggerAutoVisible()
      if (this.isAutoShowEnabled === true) this.isVisible = true
      this._left = val
      // horizontal offset to show tooltip before target position taking into account tooltip width
      var contentOffset = this.toolTipElement.clientWidth - 18
      this.toolTipElement.style.left =
        this._leftOffset + val - contentOffset + 'px'
    }
  }

  /**
   * Sets tooltip content (as plain html)
   * @param {string} html
   */
  set content(html) {
    if (this._content !== html) {
      this.triggerAutoVisible()
      this._content = html
      this.toolTipElement.innerHTML = html
    }
  }

  /**
   * triggers tooltip visibilty true when 'isAutoShowEnabled' is set to true
   */
  triggerAutoVisible() {
    if (this.isAutoShowEnabled === true) this.isVisible = true
  }
}
