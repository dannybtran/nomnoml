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
	var focusSelector = document.getElementById('focusSelector')
	var expandedNodes = {}
	var zoomLevel = 0
	var offset = {x:0, y:0}
	var mouseDownPoint = false
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
	focusSelector.addEventListener('change', changeFocus)

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

	function changeFocus() {
		sourceChanged()
	}

	function canvasClick(e) {
		var layout = currentModel.layout
		var clickedNodes = []
		recurseCanvasClick(clickedNodes, layout.nodes, e, canvasElement.offsetLeft, canvasElement.offsetTop)
		var clickedNode = clickedNodes.pop()
		if (clickedNode) { expandedNodes[clickedNode.name] = !expandedNodes[clickedNode.name] }
		console.log(expandedNodes)
	}

	function recurseCanvasClick(clickedNodes, layoutNodes, e, px, py) {
		_.each(layoutNodes, function(n) {
			var x = e.clientX
			var y = e.clientY
			var padding = currentModel.config.padding
			var gutter = currentModel.config.gutter
			var ncx = px + n.x
			var ncy = py + n.y
			var nx = ncx + padding + gutter - n.width/2
			var ny = ncy + padding + gutter - n.height/2
			if (x >= nx && x <= nx + n.width &&
					y >= ny && y <= ny + n.height) {
				clickedNodes.push(n)
				_.each(n.compartments, function(c) {
					recurseCanvasClick(clickedNodes, c.nodes, e, nx, ny)
					ny += c.height
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

	function empty(n) {
		while(n.children.length) {
			n.removeChild(n.children[0])
		}
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

	function recurseAddNode(memo, n, parentName) {
		parentName = parentName || ""
		var name = parentName ? parentName + ">" + n.name : n.name
		memo.push(name)
		if (n.compartments && n.compartments.length > 0) {
			_.each(n.compartments, function(c) {
				if (c.nodes.length > 0) {
					_.each(c.nodes, function(nn) {
						recurseAddNode(memo, nn, name)
					})
				}
			})
		}
	}

	setCurrentText(defaultSource)
	var model = sourceChanged()
	var ast = model.ast
	empty(focusSelector)
	var focusNodes = ["Root"]
	_.each(ast.nodes, function(n) {
		recurseAddNode(focusNodes, n)
	})
	_.each(focusNodes, function(n) {
		var option = document.createElement('option')
		option.appendChild(document.createTextNode(n))
		focusSelector.appendChild(option)
	})
})
