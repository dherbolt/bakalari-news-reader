//crontab
//0 17 * * * /root/scripts/perl/perlscript.pl
//0 6 * * * /root/scripts/perl/perlscript.pl

(function () {
	var
		request = require('request'),
		jsdom = require('jsdom'),
		fs = require('fs'),
		trim = require('trim'),
		jetpack = require('fs-jetpack'),
		crypto = require('crypto'),
		path = __dirname,
		cfg;

	if (path[path.length - 1 ] !== '/') {
		path += '/';
	}

	const LAST_READ_FILE_NAME = path + 'data.json';
	const LAST_READ_INIT_INFO_FILE_NAME = path + 'data-info.json';
	const LAST_READ_SCORE_FILE_NAME = path + 'data-score.json';
	const CONFIG_FILE_NAME = path + 'config.json';
	const LOG_FILE_NAME = path + 'log.txt';

	cfg = JSON.parse(fs.readFileSync(CONFIG_FILE_NAME, 'utf8'));

	log('Check for new message started');
	if (cfg.targetServer.url[cfg.targetServer.url.length - 1] !== '/') {
		cfg.targetServer.url += '/';
	}
	function getLoginForm() {
		return new Promise(function (resolve, reject) {
			request({
				uri: cfg.targetServer.url + 'login.aspx',
				method: 'POST',
				timeout: 10000,
				followRedirect: true,
				followAllRedirects: true,
				maxRedirects: 10,
				jar: true,
				gzip: true
			}, function (error, response, body) {
				if (!error) {
					jsdom.env(body, null, null, function (error, window) {
						let
							formFields = {},
							passwordFieldName,
							loginNameFieldName,
							inputs = window.document.getElementsByTagName('input');

						for (let input of inputs) {
							if ({'hidden': 1, 'submit': 1}.hasOwnProperty(input.type.toLowerCase()) && (input.name || input.id)) {
								formFields[input.name || input.id] = input.value;
							}
							else if (input.type.toLowerCase() === 'password') {
								passwordFieldName = input.name || input.id;
							}
							else if (input.type.toLowerCase() === 'text' && /(Loginname|username)$/i.test(input.name || input.id)) {
								loginNameFieldName = input.name || input.id;
							}
						}

						resolve({ formFields, passwordFieldName, loginNameFieldName});
					});
					
				}
				else {
					reject({ error });
				}
			});
		});
	}

	getLoginForm().then(function (res) {
		let form = Object.assign({}, res.formFields || {}, {
			[res.loginNameFieldName]: cfg.targetServer.loginName,
			[res.passwordFieldName]: cfg.targetServer.password
		});

		request({
			uri: cfg.targetServer.url + 'login.aspx',
			method: 'POST',
			timeout: 10000,
			followRedirect: true,
			followAllRedirects: true,
			maxRedirects: 10,
			jar: true,
			gzip: true,
			form: form
		}, onLogin);
	});

	function onLogin(error, response, body) {
		if (!error && response.statusCode === 200) {
			getInitialInfo().then(getDashboardInfo);
		}
		else {
			if (error) {
				log(error);
			}
			else {
				log('Login to server faild: ' + response.statusCode);
			}
		}
	}

	function getInitialInfo() {
		return new Promise(function (resolve, reject) {
			request({
				uri: cfg.targetServer.url + 'uvod.aspx',
				method: 'GET',
				jar: true,
				gzip: true
			}, function (error, response, body) {
				jsdom.env(body, null, null, function (error, window) {
					if (error) {
						reject({error});
					}
					else {
						let menuItems = [].slice.apply(window.document.getElementsByClassName('dx-vam'));
						let anchorEl;
						let link;

						for (let menuItem of menuItems) {
							
							if (-1 !== menuItem.innerHTML.indexOf('Průběžná klasifikace')) {
								let node = menuItem;
								let i = -1;

								//console.log(node.parentNode.parentNode.href);

								if (!node.href) {
									do {
										node = node.parentNode;
										i++;
									} while (node && (!node.href && i < 10))
								}

								if (node) {
									link = node.href;
								}

								break;
							}
						}

						let split = link.split('?');
						let p = split[1].split('=');

						request({
							uri: cfg.targetServer.url + link,
							method: 'GET',
							jar: true,
							gzip: true,
							qs: {
								[p[0]]: p[1]
							}
						}, function (error, response, body) {
							if (error) {						
								reject({error});
								return;
							}

							jsdom.env(body, null, null, function (error, window) {

								let scoreTable = window.document.getElementsByClassName('radekznamky')[0];
								if (scoreTable) {
									let lastRead = jetpack.read(LAST_READ_SCORE_FILE_NAME, 'json') || {};
									let subjectRows = [];
									let children = scoreTable.getElementsByTagName('tbody')[0].childNodes;
									let newScores = {};

									for (let i = 0; i < children.length; i++) {
										subjectRows.push(children[i]);
									}

									for (let row of subjectRows) {
										let subjectName = row.getElementsByClassName('nazevpr')[0].innerHTML;
										let scoreEls = row.getElementsByClassName('detznamka')[0].getElementsByTagName('td');
										let lastReadCnt = lastRead[subjectName] || 0;

										if (lastReadCnt < scoreEls.length) {
											newScores[subjectName] = [];
											for (let i = 0; i < scoreEls.length - lastReadCnt; i++) {
												newScores[subjectName].push({
													title: scoreEls[i].title,
													score: scoreEls[i].getElementsByTagName('span')[0].innerHTML
												});
											}
										}

										lastRead[subjectName] = scoreEls.length;
									}

									if (Object.keys(newScores).length) {
										log('New scores found.');
										sendNewScoresMail(newScores);
									}
									else {
										log('No new scores found.');
									}

									jetpack.write(LAST_READ_SCORE_FILE_NAME, JSON.stringify(lastRead, null, '\t'));
								}
								
								resolve();
							});
						});
//
//						let notificationsEl = window.document.getElementsByClassName('uvodinfot')[0];
//
//						if (notificationsEl) {
//							let rows = notificationsEl.getElementsByClassName('uvodalarm');
//
//							if (rows.length) {
//								let lastRead = jetpack.read(LAST_READ_INIT_INFO_FILE_NAME, 'json');
//								let infoTable = notificationsEl.parentNode.innerHTML;
//								let currFingerprint = countFingerprint(infoTable.replace(/\?s=[\d]+/gi, ''));
//
//								if (!lastRead || lastRead.fingerprint !== currFingerprint) {
//									log('New notifications found.');
//									sendNewNotificatoinMail(infoTable);
//									jetpack.write(LAST_READ_INIT_INFO_FILE_NAME, JSON.stringify({
//										fingerprint: currFingerprint,
//										html: infoTable
//									}, null, '\t'));
//								}
//								else {
//									log('No new notifications found.');
//								}
//							}
//						}
					}
				});
			});
		});
	}

	function countFingerprint(str) {
		let currDate = (new Date().toISOString().replace(/T.*/, ''));
		return crypto.createHash('md5').update(str + '_' + currDate).digest('hex');
	}

	function getDashboardInfo() {
		request({
			uri: cfg.targetServer.url + 'nasten.aspx?l=gr',
			method: 'GET',
			jar: true,
			gzip: true
		}, function (error, response, body) {
			jsdom.env(body, null, null, function (error, window) {
				var
					rows,
					file,
					newMsgs = [],
					msg,
					i;

				if (!error) {
					rows = window.document.getElementsByClassName('dxdvItem');

					if (rows.length) {
						for (i = 0; i < rows.length; i++) {
							msg = getMessage(rows[i]);

							if (isNewMessage(msg)) {
								newMsgs.push(msg);
							}
							else {
								break;
							}
						}

						if (newMsgs.length) {
							log('New message{s} found: ' + newMsgs.length);
							fs.writeFileSync(LAST_READ_FILE_NAME, JSON.stringify(newMsgs[0]), {encoding: 'utf8', flag: 'w'});

							sendNewMessageMail(newMsgs);
							sendCheckStatusEmail(true);
						}
						else {
							log('No new messages found');
							sendCheckStatusEmail(false);
						}
					}
				}
				else {
					log(error);
				}
			});
		});
	}

	function getMessage(rowHtml) {
		var
			author,
			date,
			msg;

		author = trim(rowHtml.getElementsByClassName('repeod')[0].getElementsByTagName('a')[0].innerHTML);
		date = trim(rowHtml.getElementsByClassName('repedatum')[0].innerHTML);
		msg = trim(rowHtml.getElementsByClassName('repetext')[0].innerHTML);

		return {
			author: author,
			date: date,
			msg: msg
		};
	}

	function isNewMessage (msg) {
		var
			lastReadMsg = '',
			fileExists,
			file;

		try {
			fs.accessSync(LAST_READ_FILE_NAME);
			fileExists = true;
		}
		catch (e) {
			fileExists = false;
		}

		if (fileExists) {
			lastReadMsg = fs.readFileSync(LAST_READ_FILE_NAME, 'utf8');
		}

		if (lastReadMsg) {
			lastReadMsg = JSON.parse(lastReadMsg);
		}

		return JSON.stringify(lastReadMsg) !== JSON.stringify(msg);
	}

	function sendNewMessageMail(msgs) {
		var
			email   = require('emailjs'),
			server  = email.server.connect(cfg.smtpServer),
			text = '',
			to = [],
			formatedMsg,
			i;

		formatedMsg = formatMessage(msgs);

		text = 'Nová zpráva v systému Bakaláři - Komens.\n\n' + formatedMsg.plain;
		log('Sending e-mail with new message: ' + JSON.stringify(msgs));

		for (i = 0; i < cfg.emailRecepients.length; i++) {
			to.push('<' + trim(cfg.emailRecepients[i]) + '>');
		}

		server.send({
			text: text,
			from: 'Skola <no-reply-skola@herbolt.com>',
			to: to.join(', '),
			subject: '[Škola] Nová zpráva',
			attachment: [{
				data: [
					'<html>',
						'<body>',
							'Nová zpráva v systému <a href="http://5.102.58.36/bakaweb/nasten.aspx?l=gr" target="_blank">Bakaláři - Komens</a>.<br><br>',
							formatedMsg.html,
						'</body>',
					'</html>'
				].join('\n'),
				alternative:true
			}]
		}, function(error, message) {
			if (error) {
				log(error);
			}
			else {
				log('E-mail sent successfully');
			}
		});
	}

	function sendNewScoresMail(scores) {
		var
			email   = require('emailjs'),
			server  = email.server.connect(cfg.smtpServer),
			text = '',
			to = [],
			formatedMsg,
			i;

		formatedMsg = formatScores(scores);

		text = 'Nové známky v systému Bakaláři - Komens.\n\n' + formatedMsg.plain || '';
		log('Sending e-mail with new message: ' + JSON.stringify(scores));

		for (i = 0; i < cfg.emailRecepients.length; i++) {
			to.push('<' + trim(cfg.emailRecepients[i]) + '>');
		}

		server.send({
			text: text,
			from: 'Skola <no-reply-skola@herbolt.com>',
			to: to.join(', '),
			subject: '[Škola] Nové známky',
			attachment: [{
				data: [
					'<html>',
						'<body>',
							'Nové známky v systému <a href="http://5.102.58.36/bakaweb/nasten.aspx?l=gr" target="_blank">Bakaláři - Komens</a>.<br><br>',
							formatedMsg.html,
						'</body>',
					'</html>'
				].join('\n'),
				alternative:true
			}]
		}, function(error, message) {
			if (error) {
				log(error);
			}
			else {
				log('E-mail sent successfully');
			}
		});
	}

	function formatScores(scores) {
		let html = [];

		for (let subjectName in scores) {
			html.push(`<h3>${subjectName}</h3>`);
			html.push('<ul>');

			for (let score of scores[subjectName]) {
				html.push(`<li>${score.title}:&nbsp;&nbsp;${score.score}</li>`);
			}

			html.push('</ul>');
		}

		html = html.join('\n');
		return { html };
	}

	function sendCheckStatusEmail(newMessageFound) {
		var
			email   = require('emailjs'),
			server  = email.server.connect(cfg.smtpServer),
			text;


		if (newMessageFound) {
			text = 'New message was found.';
		}
		else {
			text = 'No new message found.';
		}

		log('Sending check status e-mail');

		server.send({
			text: text,
			from: 'Skola <no-reply-skola@herbolt.com>',
			to: cfg.checkStatusEmailRecipient,
			subject: '[Škola] Check status',
			attachment: [{
				data: [
					'<html>',
						'<body>',
							text,
						'</body>',
					'</html>'
				].join('\n'),
				alternative:true
			}]
		}, function(error, message) {
			if (error) {
				log(error);
			}
			else {
				log('Check status E-mail sent successfully');
			}
		});
	}

	function log(msg) {
		var 
			timeStr,
			date = new Date(),
			tmp;

		tmp = [];
		tmp.push(
			formatNumber(date.getFullYear()),
			formatNumber(date.getMonth() + 1),
			formatNumber(date.getDate())
		);

		timeStr = tmp.join('/');

		tmp = [];
		tmp.push(
			formatNumber(date.getHours()),
			formatNumber(date.getMinutes()),
			formatNumber(date.getSeconds())
		);

		timeStr = '[' + timeStr + ' ' + tmp.join(':') + ']';
		msg = timeStr + ' ' + msg + '\n';

		fs.appendFileSync(LOG_FILE_NAME, msg);
	}

	function formatNumber (num) {
		if (num < 10) {
			return '0' + num;
		}

		return num + '';
	}

	function formatMessage (msgs) {
		var
			msgHtml = [],
			msgPlain = [],
			msg,
			i;

		for (i = 0; i < msgs.length; i++) {
			msg = msgs[i];

			msgPlain.push(
				'Od: ' + msg.author + '\n',
				'Datum: ' + msg.date + '\n',
				'Zpráva: ' + msg.msg + '\n',
				'\n'
			);

			msgHtml.push(
				'<div>',
					'<div>' + 'Od: ' + msg.author + '</div>',
					'<div>' + 'Datum: ' + msg.date + '</div>',
					'<div>' + 'Zpráva: ' + msg.msg + '</div>',
				'</div><br>'
			);
		}

		return {
			plain: msgPlain.join('\n'),
			html: msgHtml.join('\n')
		};
	}
}());