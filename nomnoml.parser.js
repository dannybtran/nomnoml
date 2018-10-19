var nomnoml = nomnoml || {}

nomnoml.parse = function (source, focus){
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
	var focusAst = nomnoml.transformParseIntoSyntaxTree(nomnoml.intermediateParse(pureDiagramCode, focus))
	ast.directives = directives
	return { ast: ast, focusAst: focusAst }
}

nomnoml.intermediateParse = function (source, focus){
	var arr = nomnomlCoreParser.parse(source)
	var narr
	if (focus) {
		var focusPath = focus.split(">")
		narr = nomnoml.focusParse(arr, focusPath)
	} else {
		narr = arr
	}
	return narr
}

nomnoml.focusParse = function(arr, focusPath) {
	var narr
	var path = focusPath.shift()
	narr = arr.map(function(i) {
		if (path == "Root" || path == undefined) {
			var ni
			if (i.parts) {
	  		ni = Object.assign({}, i, {parts:
				  i.parts && i.parts.length > 0 ? i.parts[0] : []
  			})
			} else {
				ni = i
			}
			return !i.id ? ni : null
		} else {
			if (path && i.id == path) {
				var resp = Object.assign({}, i, {
					parts: i.parts.map(function(p) {
						return nomnoml.focusParse(p, focusPath.slice())
					})
				})
				return resp
			} else {
				var ni
				if (i.parts) {
		  		ni = Object.assign({}, i, {parts:
					  i.parts && i.parts.length > 0 ? i.parts[0] : []
	  			})
				} else {
					ni = i
				}
				return !i.id ? ni : null
			}
		}
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
			return _.max(cList, function (c){ return c.compartments.length })
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
			return nomnoml.Classifier(entity.type, entity.id, compartments)
		}
		return undefined
	}

	return transformItem(entity)
}
