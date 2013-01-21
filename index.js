#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var dir = process.cwd();
var requirejs = require('component-require');

var program = require('commander');

program
  .option('-o, --out <file>', 'output directory defaulting to ./build', 'build.js')
	.parse(process.argv);

function Component(dir, root, parent) {
	this.parent = parent;
	this.root = root || this;

	this.dir = dir;
	this.json = JSON.parse(this.readText('component.json'));
	this._aliases = {};
	this._dependencies = {};
	this.locals = (this.json.local || []).map(function (local) {
		return new Component(local, this.root, this.parent);
	});

	Object.keys(this.json.dependencies || {}).forEach(function (dependency) {
		if (!(dependency in this.root._dependencies)) {
			this.root._dependencies[dependency] = [];
		}
		this.root._dependencies[dependency].push(this);
		this.dependency(dependency);
	}.bind(this));
}

Component.prototype.aliases = function () {
	var deps = this.dependencies();//console.log(this._dependencies);
	if (!this._aliases) {
		return console.log('no aliases');
	}

	var aliases = [];

	Object.keys(this._dependencies).forEach(function (dependency){
		var dependents = this._dependencies[dependency];
		
		var dependencyComponent = this.dependency(dependency);

		dependents.forEach(function (dependent) {
			var dependentName = (dependent.isRoot() ? dependent.json.name: dependent.json.repo.replace('/', '-'));
			dependencyComponent.json.scripts.forEach(function (script) {
				var from = path.join(dependency.replace('/', '-'), script);
				var to = path.join(
					dependentName,
					'deps',
					dependencyComponent.json.name, script);

				var alreadyAliased = aliases.filter(function (entry) {
					return entry.from == from && entry.to == to;
				}).length > 0;

				if (!alreadyAliased)
					aliases.push({from:from, to:to});
			}.bind(this));

			if (dependencyComponent.json.main) {
				var mainAlias = {
					from: path.join(dependency.replace('/', '-'), dependencyComponent.json.main),
					to: path.join(dependentName, 'deps', dependencyComponent.json.name, 'index.js')
				};
				aliases.push(mainAlias);
			}

		}.bind(this));
	}.bind(this));


	return aliases.reduce(function (acc, alias){
		return acc + 'require.alias("' + alias.from +
			'", "' + alias.to +'")\n';
	}, '');
};

Component.prototype.isRoot = function() {
	return this.root === this;
};

Component.prototype.resolve = function (p) {
	return path.join(this.dir, p);
};

Component.prototype.read = function (file) {
	return fs.readFileSync(this.resolve(file));
};

Component.prototype.readText = function (file) {
	return this.read(file).toString();
};

Component.prototype.tests = function () {
	return (this.json.tests || []).map(this.readText.bind(this)).join('\n');
};

Component.prototype.scripts = function () {
	return this.json.scripts.map(function (script) {
		return {
			name: script,
			js: this.readText(script)
		};
	}.bind(this));
};

Component.prototype.register = function (script) {
	var name = path.join(this.dir || this.json.name , script.name).replace('components/', '');
	return 'require.register("' + name + '", function (exports, require, module){\n' +
		script.js.replace(/^/mg, '  ') +
		'\n});';
};

Component.prototype.toString = function () {
	var deps = this.dependencies().join('\n');
	var locals = this.locals.map(function(local) {
		return local.toString();
	}).join('\n');
	return [
		deps, locals, this.scripts()
			.map(this.register.bind(this))
			.join('\n')
	].join('\n');
};

Component.prototype.dependency = function (dependency) {
	this._dependencyComponents = this._dependencyComponents || {};
	if (dependency in this._dependencyComponents)
		return this._dependencyComponents[dependency];
	
	return this._dependencyComponents[dependency] =
		new Component('components/' + dependency.replace('/', '-'),
			this.root);
};

Component.prototype.dependencies = function () {
	return Object.keys(this._dependencies || []).map(this.dependency.bind(this));
};

var component = new Component();

var source = [
	requirejs,
	component.toString(),
	component.aliases()].join('\n');
//console.log(component.toString());

fs.writeFileSync(program.out, source);