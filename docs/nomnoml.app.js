var nomnoml = nomnoml || {}

$(function (){

	var storage = null
	var jqCanvas = $('#canvas')
	var viewport = $(window)
	var jqBody = $('body')
	var lineNumbers = $('#linenumbers')
	var lineMarker = $('#linemarker')
	var storageStatusElement = $('#storage-status')
	var textarea = document.getElementById('textarea')
	var imgLink = document.getElementById('savebutton')
	var linkLink = document.getElementById('linkbutton')
	var canvasElement = document.getElementById('canvas')
	var canvasPanner = document.getElementById('canvas-panner')
	var canvasTools = document.getElementById('canvas-tools')
	var defaultSource = document.getElementById('defaultGraph').innerHTML
	var expandedNodes = window.expandedNodes = {}
	var zoomLevel = 0
	var offset = {x:0, y:0}
	var mouseDownPoint = false
	var mouseDownClientPoint = false
	var vm = skanaar.vector

	window.addEventListener('hashchange', reloadStorage);
	window.addEventListener('resize', _.throttle(sourceChanged, 750, {leading: true}))
	canvasPanner.addEventListener('mouseenter', classToggler(jqBody, 'canvas-mode', true))
	canvasPanner.addEventListener('mouseleave', classToggler(jqBody, 'canvas-mode', false))
	canvasTools.addEventListener('mouseenter', classToggler(jqBody, 'canvas-mode', true))
	canvasTools.addEventListener('mouseleave', classToggler(jqBody, 'canvas-mode', false))
	canvasPanner.addEventListener('mousedown', mouseDown)
	window.addEventListener('mousemove', _.throttle(mouseMove,50))
	canvasPanner.addEventListener('mouseup', canvasClick)
	canvasPanner.addEventListener('mouseup', mouseUp)
	canvasPanner.addEventListener('mouseleave', mouseUp)
	canvasPanner.addEventListener('wheel', _.throttle(magnify, 50))

	initImageDownloadLink(imgLink, canvasElement)
	initToolbarTooltips()

	reloadStorage()

	function classToggler(element, className, state){
		var jqElement = $(element)
		return _.bind(jqElement.toggleClass, jqElement, className, state)
	}

	function mouseDown(e){
		$(canvasPanner).css({width: '100%'})
		mouseDownPoint = vm.diff({ x: e.pageX, y: e.pageY }, offset)
		mouseDownClientPoint = {x: e.clientX, y: e.clientY}
	}

	function mouseMove(e){
		if (mouseDownPoint){
			offset = vm.diff({ x: e.pageX, y: e.pageY }, mouseDownPoint)
			sourceChanged()
		}
	}

	function mouseUp(e){
		mouseDownPoint = false
		$(canvasPanner).css({width: '100%'})
	}

	function magnify(e){
		zoomLevel = Math.min(10, zoomLevel - (e.deltaY < 0 ? -1 : 1))
		sourceChanged()
	}

	function canvasClick(e) {
		var layout = currentModel.layout
		var config = currentModel.config
		var clickedNodes = []
		var clickDist = vm.dist({ x: e.clientX, y: e.clientY }, mouseDownClientPoint)
		if (clickDist > 20) { return }
		recurseCanvasClick(clickedNodes, layout.nodes,
			e,
			canvasElement.offsetLeft,
			canvasElement.offsetTop,
			config.zoom
		)
		var clickedNode = clickedNodes.pop()
		if (clickedNode) {
			if (clickedNode.name.toLowerCase().slice(0,5) == "link:") {
				window.open(clickedNode.name.slice(5))
			}
			expandedNodes[clickedNode.name] = !expandedNodes[clickedNode.name]
		}
		sourceChanged()
	}

	function recurseCanvasClick(clickedNodes, layoutNodes, e, px, py, zoom) {
		_.each(layoutNodes, function(n) {
			var x = e.clientX
			var y = e.clientY
			var padding = currentModel.config.padding
			var gutter = currentModel.config.gutter
			var lineWidth = currentModel.config.lineWidth
			var superSampling = window.devicePixelRatio || 1
			var scale = superSampling * Math.exp(zoomLevel/10)
			console.log(scale)
			console.log(canvasElement.offsetLeft, canvasElement.offsetTop)
			var ncx = px + (n.x + padding + gutter + lineWidth) * scale
			var ncy = py + (n.y + padding + gutter + lineWidth) * scale
			var nx = ncx - scale * (n.width/2 + lineWidth)
			var ny = ncy - scale * (n.height/2 + lineWidth)
			console.log(n.name, n, px, py, e)
			// var outline = document.createElement('div')
			// outline.style = "position: absolute; top: " + ny + "px; left: " + nx +
			// "px; width: " + ((n.width) * scale) + "px; height: " + ((n.height) * scale) + "px; " +
			// "border: 1px solid red;"
			// if (zoom != 1) {
			// 	document.body.appendChild(outline)
			// }
			if (x >= nx && x <= nx + (n.width) * scale &&
					y >= ny && y <= ny + (n.height) * scale) {
			  	clickedNodes.push(n)
				_.each(n.compartments, function(c) {
					recurseCanvasClick(clickedNodes, c.nodes, e, nx, ny, zoom)
					ny += c.height * scale
				})
			}
		})
	}

	nomnoml.magnifyViewport = function (diff){
		zoomLevel = Math.min(10, zoomLevel + diff)
		sourceChanged()
	}

	nomnoml.resetViewport = function (){
		zoomLevel = 1
		offset = {x: 0, y: 0}
		sourceChanged()
	}

	nomnoml.toggleSidebar = function (id){
		var sidebars = ['reference', 'about']
		_.each(sidebars, function (key){
			if (id !== key) $(document.getElementById(key)).toggleClass('visible', false)
		})
		$(document.getElementById(id)).toggleClass('visible')
	}

	nomnoml.discardCurrentGraph = function (){
		if (confirm('Do you want to discard current diagram and load the default example?')){
			setCurrentText(defaultSource)
			sourceChanged()
		}
	}

	nomnoml.saveViewModeToStorage = function (){
		var question =
			'Do you want to overwrite the diagram in ' +
			'localStorage with the currently viewed diagram?'
		if (confirm(question)){
			storage.moveToLocalStorage()
			window.location = './'
		}
	}

	nomnoml.exitViewMode = function (){
		window.location = './'
	}

	// Adapted from http://meyerweb.com/eric/tools/dencoder/
	function urlEncode(unencoded) {
		return encodeURIComponent(unencoded).replace(/'/g,'%27').replace(/"/g,'%22')
	}

	function urlDecode(encoded) {
		return decodeURIComponent(encoded.replace(/\+/g, ' '))
	}

	function setShareableLink(str){
		var base = '#view/'
		linkLink.href = base + urlEncode(str)
	}

	function buildStorage(locationHash){
		var key = 'nomnoml.lastSource'
		if (locationHash.substring(0,6) === '#view/')
			return {
				read: function (){ return urlDecode(locationHash.substring(6)) },
				save: function (){ setShareableLink(currentText()) },
				moveToLocalStorage: function (){ localStorage[key] = currentText() },
				isReadonly: true
			}
		return {
			read: function (){ return localStorage[key] || defaultSource },
			save: function (source){
				setShareableLink(currentText())
				localStorage[key] = source
			},
			moveToLocalStorage: function (){},
			isReadonly: false
		}
	}

	function initImageDownloadLink(link, canvasElement){
		link.addEventListener('click', downloadImage, false);
		function downloadImage(){
			var url = canvasElement.toDataURL('image/png')
			link.href = url;
		}
	}

	function initToolbarTooltips(){
		var tooltip = $('#tooltip')[0]
		$('.tools a').each(function (i, link){
			link.onmouseover = function (){ tooltip.textContent  = $(link).attr('title') }
			link.onmouseout = function (){ tooltip.textContent  = '' }
		})
	}

	function positionCanvas(rect, superSampling, offset){
		var w = rect.width / superSampling
		var h = rect.height / superSampling
		jqCanvas.css({
			top: 300 * (1 - h/viewport.height()) + offset.y,
			left: 150 + (viewport.width() - w)/2 + offset.x,
			width: w,
			height: h
		})
	}

	function setFilename(filename){
		imgLink.download = filename + '.png'
	}

	function reloadStorage(){
	}

	function currentText(){
		return this.currentTextValue
	}

	function setCurrentText(value){
		this.currentTextValue = value
	}

	var currentModel
	function sourceChanged(){
		var superSampling = window.devicePixelRatio || 1
		var scale = superSampling * Math.exp(zoomLevel/10)
		currentModel = nomnoml.draw(canvasElement, currentText(), scale, expandedNodes)
		positionCanvas(canvasElement, superSampling, offset)
		setFilename(currentModel.config.title)
		return currentModel
	}

	setCurrentText(defaultSource)
	sourceChanged()
})
