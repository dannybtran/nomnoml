var nomnoml = nomnoml || {}

nomnoml.parse = function (source, expandedNodes){
	function onlyCompilables(line){
		var ok = line[0] !== '#' && line.substring(0,2) !== '//'
		return ok ? line : ''
	}
	var isDirective = function (line){ return line.text[0] === '#' }
	var lines = source.split('\n').map(function (s, i){
		return {text: s.trim(), index: i }
	})
	var pureDirectives = _.filter(lines, isDirective)
	var directives = _.object(pureDirectives.map(function (line){
		try {
			var tokens =  line.text.substring(1).split(':')
			return [tokens[0].trim(), tokens[1].trim()]
		}
		catch (e) {
			throw new Error('line ' + (line.index + 1))
		}
	}))
	var pureDiagramCode = _.map(_.pluck(lines, 'text'), onlyCompilables).join('\n').trim()
	var ast = nomnoml.transformParseIntoSyntaxTree(nomnoml.intermediateParse(pureDiagramCode))
	var focusAst = nomnoml.transformParseIntoSyntaxTree(nomnoml.intermediateParse(pureDiagramCode, expandedNodes))
	ast.directives = directives
	return { ast: ast, focusAst: focusAst }
}

nomnoml.intermediateParse = function (source, expandedNodes){
	var arr = nomnomlCoreParser.parse(source)
	var narr
	narr = nomnoml.focusParse(arr, expandedNodes)
	return narr
}

nomnoml.focusParse = function(arr, expandedNodes) {
	expandedNodes = expandedNodes || {}
	var narr
	narr = arr.map(function(i) {
		if (i.start) {
			i.start.expandable = i.start.parts.length > 1
			if (!expandedNodes[i.start.id]) {
				if (i.start.parts.length > 0) {
					i.start.parts = [i.start.parts[0]]
				}
			} else if (i.start.parts.length > 0) {
				i.start.parts = i.start.parts.map(function(p) {
					return nomnoml.focusParse(p, expandedNodes)
				})
			}
		}
		if (i.end) {
			i.end.expandable = i.end.parts.length > 1
			if (!expandedNodes[i.end.id]) {
				if (i.end.parts.length > 0) {
					i.end.parts = [i.end.parts[0]]
				}
			} else if (i.end.parts.length > 0) {
				i.end.parts = i.end.parts.map(function(p) {
					return nomnoml.focusParse(p, expandedNodes)
				})
			}
		}
		if (i.id) {
			i.expandable = i.parts.length > 1
			if (!expandedNodes[i.id]) {
				if (i.parts.length > 0) {
					i.parts = [i.parts[0]]
				}
			} else if (i.parts.length > 0) {
				i.parts = i.parts.map(function(p) {
					return nomnoml.focusParse(p, expandedNodes)
				})
			}
		}
		return i
	}).filter(function(i) { return i })
	return narr
}

nomnoml.transformParseIntoSyntaxTree = function (entity){

	var relationId = 0

	function transformCompartment(parts){
		var lines = []
		var rawClassifiers = []
		var relations = []
		_.each(parts, function (p){
			if (typeof p === 'string')
				lines.push(p)
			if (p.assoc){ // is a relation
				rawClassifiers.push(p.start)
				rawClassifiers.push(p.end)
				relations.push({
                    id: relationId++,
                    assoc: p.assoc,
                    start: p.start.parts[0][0],
                    end: p.end.parts[0][0],
                    startLabel: p.startLabel,
                    endLabel: p.endLabel
                })
            }
			if (p.parts){ // is a classifier
				rawClassifiers.push(p)
            }
		})
		var allClassifiers = _.map(rawClassifiers, transformItem)
		var noDuplicates = _.map(_.groupBy(allClassifiers, 'name'), function (cList){
			return Object.assign({},
				_.max(cList, function (c){ return c.compartments.length }),
				{
					expandable: _.any(cList.map(function(c) { return c.expandable }))
				}
			)
		})

		return nomnoml.Compartment(lines, noDuplicates, relations)
	}

	function transformItem(entity){
		if (typeof entity === 'string')
			return entity
		if (_.isArray(entity))
			return transformCompartment(entity)
		if (entity.parts){
			var compartments = _.map(entity.parts, transformCompartment)
			return nomnoml.Classifier(entity.type, entity.id, compartments, entity.expandable)
		}
		return undefined
	}

	return transformItem(entity)
}
