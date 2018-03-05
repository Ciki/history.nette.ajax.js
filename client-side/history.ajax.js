(function ($, undefined) {

	// Is History API reliably supported? (based on Modernizr & PJAX)
	if (!(window.history && history.pushState && window.history.replaceState && !navigator.userAgent.match(/((iPod|iPhone|iPad).+\bOS\s+[1-4]|WebApps\/.+CFNetwork)/))) {
		return;
	}

	// make payload:redirect work
	// let this extension handle window.history api only
	//$.nette.ext('redirect', false);

	var findSnippets = function () {
		var result = [];
		$('[id^="snippet-"]').each(function () {
			var $el = $(this);
			if (!$el.is('[data-history-nocache]')) {
				result.push({
					id: $el.attr('id'),
					html: $el.html()
				});
			}
		});
		return result;
	};

	var handleState = function (context, name, args) {
		var handler = context['handle' + name.substring(0, 1).toUpperCase() + name.substring(1)];
		if (handler) {
			handler.apply(context, args);
		}
	};

	$.nette.ext('history', {
		init: function () {
			var snippetsExt;
			if (this.cache && (snippetsExt = $.nette.ext('snippets'))) {
				this.handleUI = function (domCache) {
					var snippets = {};
					$.each(loadSnippets(domCache), function () {
						snippets[this.id] = this.html;
					});
					snippetsExt.updateSnippets(snippets, true);
					$.nette.load();
				};
			}

			this.popped = !!('state' in window.history) && !!window.history.state;
			var initialUrl = window.location.href;

			$(window).on('popstate.nette', $.proxy(function (e) {
				var state = e.originalEvent.state || this.initialState;
				// handle only own history stack
				if (!state.nette) {
					return false;
				}
				var initialPop = (!this.popped && initialUrl === state.href);
				this.popped = true;
				if (initialPop) {
					return;
				}
				if (this.cache && state.ui) {
					handleState(this, 'UI', [state.ui]);
					handleState(this, 'title', [state.title]);
				} else {
					$.nette.ajax({
						url: state.href,
						off: ['history']
					});
				}
			}, this));

			history.replaceState(this.initialState = {
				nette: true,
				href: window.location.href,
				title: document.title,
				ui: this.cache ? saveSnippets(window.location.href) : null
			}, document.title, window.location.href);
		},
		before: function (xhr, settings) {
			if (!settings.nette) {
				this.href = null;
			} else if (!settings.nette.form) {
				if ($(settings.nette.ui).attr('rel') !== 'nohistory') {
					this.href = settings.nette.ui.href;
				}
			} else if (settings.nette.form[0].method === 'get') {
				// grido submit buttons (search|reset)
				if (settings.nette.form.hasClass('grido') && settings.nette.ui.name.indexOf('buttons[') === 0) {
					this.href = settings.url;
				} else {
					this.href = settings.nette.form[0].action || window.location.href;
				}
			} else {
				this.href = null;
			}
		},
		success: function (payload) {
			var redirect = payload.redirect || payload.url; // backwards compatibility for 'url'
			if (redirect) {
				var regexp = new RegExp('//' + window.location.host + '($|/)');
				if ((redirect.substring(0, 4) === 'http') ? regexp.test(redirect) : true) {
					this.href = redirect;
				} else {
					window.location.href = redirect;
				}
			}

			// here we could potentially clean up grido filters as in grido.js::handleSuccessEvent(payload)
			// ...

			if (this.href && this.href != window.location.href && this.href.indexOf('do=') === -1) {
				try {
					// max size of stateObject being pushed is 640k for Firefox https://developer.mozilla.org/en-US/docs/Web/API/History_API#The_pushState%28%29_method
					history.pushState({
						nette: true,
						href: this.href,
						title: document.title,
						ui: this.cache ? saveSnippets(this.href) : null
					}, document.title, this.href);
				} catch (err) {
					console.log('Cannot store state to history. Maybe content exceeds allowed size limit (640k for Firefox)?');
					console.log(err);
				}
			}
			this.href = null;
			this.popped = true;
		}
	}, {
		href: null,
		cache: true,
		useLocalStorage: true,
		popped: false,
		handleTitle: function (title) {
			document.title = title;
		},
		/**
		 * Either save snippets to localStorage & return key or return snippets content to be processed elsewhere.
		 * @param {String} hashKey
		 * @returns {Array|String|null} NULL on error
		 */
		saveSnippets: function (hashKey) {
			var snippets = findSnippets();
			if (this.useLocalStorage && window.localStorage) {
				try {
					localStorage.setItem(hashKey, JSON.stringify(snippets));
					return hashKey;
					// storage can be full, max size ~10MB Chrome/Firefox, 5MB other browsers - https://www.html5rocks.com/en/tutorials/offline/quota-research/#toc-overview
				} catch (err) {
					return null;
				}
			} else {
				return snippets;
			}
		},
		/**
		 * Load array of snippet objects.
		 * @param {String} snippetsOrHash
		 * @returns {Array}
		 */
		loadSnippets: function (snippetsOrHash) {
			if (this.useLocalStorage && window.localStorage) {
				return JSON.parse(localStorage.getItem(snippetsOrHash));
			} else {
				return snippetsOrHash;
			}
		}
	});
})(jQuery);
