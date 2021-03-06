﻿/**
  O'Splits - Orienteering Results Viewer

  Copyright (C) 2013 by Jan Vorwerk <jan.vorwerk at angexis dot com>

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';
if (window.osplits) {
    console.log("O'Splits: already loaded");
}
else {
    console.log("O'Splits: loading...");
    String.prototype.trim = String.prototype.trim || function() {
        return this.replace(/^\s+|\s+$/g, '');
    };
    var osplits = {};
    osplits.util = {
        VALUE_MP : 90000000, // this value is from Geco!
        str2sec: function(tString) {
            if (!tString) {
                return osplits.util.VALUE_MP;
            }
            else if (tString === '-----') {
                return osplits.util.VALUE_MP;
            }
            var bits = tString.split(':');
            if (bits.length < 3) {
                bits.unshift('0');
            }
            var sec = 0;
            sec += bits[0] * 3600;
            sec += bits[1] * 60;
            sec += bits[2] * 1; // to int!
            return sec;
        },
        sec2str: function(tSec) {
            if (tSec === osplits.util.VALUE_MP) {
                return '-----';
            }
            var bits = [];
            bits[2] = parseInt(tSec / 3600);
            tSec %= 3600;
            bits[1] = parseInt(tSec/60);
            tSec %= 60;
            bits[0] = parseInt(tSec);
            var tString = '';
            if (bits[2] > 0) {
                tString += bits[2] + ':';
                if (bits[1] < 10) {
                    tString += '0';
                }
            }
            tString += bits[1] + ':';
            if (bits[0] < 10) {
                tString += '0';
            }
            tString += bits[0];
            return tString;
        }
    },
    osplits.webdb = {
        db: null,
        open : function() {
            var dbname = 'osplits:' + window.location.pathname;
            var dbSize = 5 * 1024 * 1024; // 5MB
            osplits.webdb.db = new SQL.Database();// openDatabase(dbname, "1.0", "O'Splits Storage", dbSize);
        },
        selectAsObjects: function(query, args) {
            var stmt = osplits.webdb.db.prepare(query, args);
            var results = []
            while (stmt.step())
                results.push(stmt.getAsObject())
            return results
        },

        createTables : function() {
            osplits.webdb.db.run("BEGIN TRANSACTION");
                osplits.webdb.db.run("DROP TABLE IF EXISTS time");
                osplits.webdb.db.run("DROP TABLE IF EXISTS runner");
                osplits.webdb.db.run("DROP TABLE IF EXISTS circuit");
                osplits.webdb.db.run("CREATE TABLE IF NOT EXISTS circuit(id INTEGER PRIMARY KEY ASC, number INTEGER, description TEXT, ctrlCount INTEGER)");
                osplits.webdb.db.run("CREATE TABLE IF NOT EXISTS runner(id INTEGER PRIMARY KEY ASC, circuitId INTEGER, rank INTEGER, name TEXT, club TEXT, category TEXT)");
                osplits.webdb.db.run("CREATE TABLE IF NOT EXISTS time(id INTEGER PRIMARY KEY ASC, circuitId INTEGER, runnerId INTEGER, numInCircuit INTEGER, fromCtrl TEXT, toCtrl TEXT, legSec INTEGER, cumSec INTEGER)");
            osplits.webdb.db.run("COMMIT");
        },

        storeCircuitTxn: function(number, circuit) {
            var noop = function(){};
            var storeCircuit = function() {
                osplits.webdb.db.run("INSERT INTO circuit(number, description, ctrlCount) VALUES (?,?,?)", [number, circuit.description, circuit.controls.length])
                            var insertId = osplits.webdb.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
                            for(var i=0; i<circuit.rankedRunners.length;i++) {
                                storeRunner(insertId, circuit.rankedRunners[i]);
                            }
                            for(var i=0; i<circuit.unrankedRunners.length;i++) {
                                var r = circuit.unrankedRunners[i];
                                if (!r.rank) r.rank = r.status;
                                storeRunner(insertId, r);
                            }
            };
            var storeRunner = function(circuitId, runner) {
                osplits.webdb.db.run("INSERT INTO runner(circuitId, rank, name, club, category) VALUES (?,?,?,?,?)", [circuitId, runner.rank, runner.firstname + ' ' + runner.lastname, runner.club, runner.category])
                            var insertId = osplits.webdb.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
                            var _getLegSec = function(cumTimes, index) {
                                var legSec = cumTimes[index];
                                if (legSec != osplits.util.VALUE_MP) {
                                    for (var j = index; j > 0; j--) {
                                        if (cumTimes[j-1] != osplits.util.VALUE_MP) {
                                            legSec -= cumTimes[j-1];
                                            break;
                                        }
                                    }
                                }
                                return legSec;
                            };
                            var fromCtrl = 'D';
                            for(var i=0; i<circuit.controls.length;i++) {
                                var cumSec = runner.cumulatedTimes[i];
                                var legSec = _getLegSec(runner.cumulatedTimes, i);
                                var toCtrl = '' + circuit.controls[i];
                                var numInCircuit = i + 1;
                                storeTime(circuitId, insertId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec);
                                fromCtrl = toCtrl;
                            }
                            var cumSec = runner.cumulatedTimes[circuit.controls.length];
                            var legSec = _getLegSec(runner.cumulatedTimes, circuit.controls.length);
                            storeTime(circuitId, insertId, 'A', fromCtrl, 'A', legSec, cumSec);
            };
            var storeTime = function(circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec) {
                osplits.webdb.db.run("INSERT INTO time(circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec) VALUES (?,?,?,?,?,?,?)",
                        [circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec], noop, osplits.webdb.onError);
            };

            storeCircuit();
        },
        storeCircuitTxnV1: function(number, circuit) {
            var noop = function(){};
            var storeCircuit = function() {
                osplits.webdb.db.run("INSERT INTO circuit(number, description, ctrlCount) VALUES (?,?,?)", [number, circuit.description, circuit.controls.length - 1])
                            var insertId = osplits.webdb.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
                            for(var i=0; i<circuit.runners.length;i++) {
                                storeRunner(insertId, circuit.runners[i]);
                            }



            };
            var storeRunner = function(circuitId, runner) {
                osplits.webdb.db.run("INSERT INTO runner(circuitId, rank, name, club, category) VALUES (?,?,?,?,?)", [circuitId, runner.rank, runner.name, runner.club, runner.category])
                            var insertId = osplits.webdb.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
                            var fromCtrl = 'D';
                            for(var i=0; i<circuit.controls.length;i++) {
                                var legSec = osplits.util.str2sec(runner.legTimes[i]);
                                var cumSec = osplits.util.str2sec(runner.cumTimes[i]);
                                var toCtrl = circuit.controls[i].id;
                                var numInCircuit = circuit.controls[i].n;
                                storeTime(circuitId, insertId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec);
                                fromCtrl = toCtrl;
                            }
            };
            var storeTime = function(circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec) {
                osplits.webdb.db.run("INSERT INTO time(circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec) VALUES (?,?,?,?,?,?,?)",
                        [circuitId, runnerId, numInCircuit, fromCtrl, toCtrl, legSec, cumSec], noop, osplits.webdb.onError);
            };
                storeCircuit();
        }
    };
    osplits.webdb.open();
    osplits.webdb.createTables();
    osplits.parser = {
        PARENT : undefined,
        OURDIV : undefined,
        BACKUP : undefined,
        LANGS: {
            fr: {
                rank:'Pl',
                name:'Nom',
                category:'Cat.',
                time: 'Temps',
                pm: 'pm'
            }
        },
        LANG:undefined,
        HEADLINE : {},
        Extractor: function(from,to){
            this.from = from;
            this.to = to;
        },
        storeJson: function(jsonResults) {
            for(var circuitNum=0; circuitNum < jsonResults.circuits.length; circuitNum++) {
                osplits.webdb.storeCircuitTxn(circuitNum, jsonResults.circuits[circuitNum]);
            }
            return circuitNum;
        },
        storeJsonV1: function(jsonResults) {
            for(var circuitNum=0; circuitNum < jsonResults.circuits.length; circuitNum++) {
                var fromCircuit = jsonResults.circuits[circuitNum];
                if (fromCircuit.rankedRunners.length > 0) {
                    var toCircuit = {};
                    toCircuit.number = fromCircuit.circuitNum;
                    toCircuit.description = fromCircuit.description;
                    toCircuit.controls = [];
                    toCircuit.runners = [];
                    for (var ctrlIndex=0; ctrlIndex < fromCircuit.rankedRunners[0].controlCodes.length; ctrlIndex++) {
                        var ctrlId = fromCircuit.rankedRunners[0].controlCodes[ctrlIndex];
                        if (fromCircuit.rankedRunners[0].controlCodes[ctrlIndex] === 'F') {
                            break;
                        }
                        toCircuit.controls.push({n:''+(ctrlIndex+1), id:ctrlId});
                    }
                    toCircuit.controls.push({n:''+toCircuit.controls.length+1, id:'A'});

                    for(var runnerNum=0; runnerNum < fromCircuit.rankedRunners.length; runnerNum++) {
                        var fromRunner = fromCircuit.rankedRunners[runnerNum];
                        var toRunner = {};
                        toRunner.rank = fromRunner.rank;
                        toRunner.name = fromRunner.firstname + ' ' + fromRunner.lastname;
                        toRunner.club = fromRunner.club;
                        toRunner.category = fromRunner.category;
                        toRunner.legTimes = [];
                        toRunner.cumTimes = [];
                        for (var i=0; i<toCircuit.controls.length; i++) {
                            toRunner.legTimes[i] = fromRunner.splitTimes[i];
                            toRunner.cumTimes[i] = fromRunner.cumulatedTimes[i];
                        }
                        toCircuit.runners.push(toRunner);
                    }
                    osplits.webdb.storeCircuitTxnV1(circuitNum, toCircuit);
                }
            }
            return circuitNum;
        },
        parseDocument : function() {
            osplits.parser.BACKUP = document.getElementsByTagName('pre')[0];
            osplits.parser.PARENT = osplits.parser.BACKUP.parentElement;
            osplits.parser.LANG = osplits.parser.LANGS.fr;
            var fullText = osplits.parser.BACKUP.innerText;
            var circuits = fullText.split(/\n{3}/); // all circuits are (hopefully) separated by 3 blank lines
            var head = circuits.shift();
            var found = 0;
            var extractLeftAligned = function(tt){
                var from = head.indexOf(tt);
                if (from === -1){
                    return undefined;
                }
                var to = head.slice(from+tt.length).search(/\S/);
                to += tt.length + from;
                to -= 2; // this is a dirty hack for results by categories (http://nose42.fr/data/resultats/2013/we-clmd/CLMD_CategoriesSI.html)
                return new osplits.parser.Extractor(from, to);
            };
            var extractRightAligned = function(tt, len){
                var to = head.indexOf(tt);
                if (to === -1){
                    return undefined;
                }
                to += tt.length;
                var from = to -len;
                if (from < 0) {
                    from = 0;
                }
                return new osplits.parser.Extractor(from, to);
            };
            osplits.parser.HEADLINE.rank = extractRightAligned(osplits.parser.LANG.rank, 3);
            osplits.parser.HEADLINE.name = extractLeftAligned(osplits.parser.LANG.name);
            osplits.parser.HEADLINE.category = extractLeftAligned(osplits.parser.LANG.category, 4);
            osplits.parser.HEADLINE.time = extractRightAligned(osplits.parser.LANG.time, '3:59:59'.length);
            osplits.parser.HEADLINE.data = new osplits.parser.Extractor(osplits.parser.HEADLINE.time.to + 1);

            for(var i=0; i<circuits.length; i++) {
                var lines = circuits[i].split(/\n/);
                while (lines.length > 0) {
                    var circuit = osplits.parser.getOneCircuit(lines);
                    if (circuit){
                        found++;
                        osplits.webdb.storeCircuitTxnV1(found, circuit);
                    }
                }
            }
            return found;
        },
        getOneCircuit : function(lines) {
            var line;
            var _skipEmptyLines = function(){
                do {
                    line = lines.shift();
                } while (lines.length > 0 && !line);
                lines.unshift(line);
            };
            var circuit = {};
            _skipEmptyLines();
            circuit.description = lines.shift();
            circuit.controls = [];
            circuit.runners = [];
            circuit.controlLinesCount = 0;
            var controls = "";
            do {
                line = lines.shift();
                if (line) {
                    controls += line;
                    circuit.controlLinesCount++;
                }
            } while (lines.length > 0 && line);
            var tmpResultsArr;
            var reControls = /(\d+)\((\d+)\)/g;
            while ((tmpResultsArr = reControls.exec(controls)) !== null) {
                var controlNumber = tmpResultsArr[1];
                var controlId = tmpResultsArr[2];
                circuit.controls.push({
                    n : controlNumber,
                    id : controlId
                });
            }
            if (circuit.controls.length === 0){
                console.log('Not a split times circuit: ' + circuit.description);
                return undefined;
            }
            circuit.controls.push({
                n : 'A',
                id : 'A'
            });
            _skipEmptyLines();
            // Read runners
            var runner, absRank = 0;
            do {
                runner = osplits.parser.getOneRunner(circuit.controlLinesCount, lines, ++absRank);
                if (runner) {
//                    console.log('Read ' + runner.name); // DO NOT LEAVE THIS AS IT TAKES AGES TO RUN
                    circuit.runners.push(runner);
                }
            } while (runner);
            return circuit;
        },
        getOneRunner : function(controlLinesCount, lines, absoluteRank) {
            var line1 = lines.shift();
            if (!line1) {
                line1 = lines.shift(); // allow 1 empty line
                if (!line1) {
                    return undefined;
                }
            }
            var line2 = lines.shift();
            if (!line2) {
                return undefined;
            }
            var runner = {};
            runner.rank = osplits.parser.HEADLINE.rank && osplits.parser.HEADLINE.rank.extract(line1) || '';
            runner.name = osplits.parser.HEADLINE.name && osplits.parser.HEADLINE.name.extract(line1) || '';
            runner.category = osplits.parser.HEADLINE.category && osplits.parser.HEADLINE.category.extract(line1) || '';
            runner.club = osplits.parser.HEADLINE.name && osplits.parser.HEADLINE.name.extract(line2) || '';
            var time = osplits.parser.HEADLINE.time && osplits.parser.HEADLINE.time.extract(line1) || '';

            if (time.trim() === osplits.parser.LANG.pm) {
                runner.rank = osplits.util.VALUE_MP + absoluteRank;
            }

            if (!runner.rank) {
                return undefined;
            }

            lines.unshift(line2);
            lines.unshift(line1);

            var totals = "";
            var legs = "";
            var line;
            for (var i = 0; i < controlLinesCount; i++) {
                line = lines.shift();
                line = osplits.parser.HEADLINE.data.extract(line);
                totals += ' ' + line;
                line = lines.shift();
                line = osplits.parser.HEADLINE.data.extract(line);
                legs += ' ' + line;
            }
            do {
                line = lines.shift();
            } while(lines.length > 0 && line && !osplits.parser.HEADLINE.time.extract(line))
            if (line) {
                lines.unshift(line);
            }

            runner.cumTimes = totals.trim().split(/\s+/);
            runner.legTimes = legs.trim().split(/\s+/);

            var pmMarker = '-----';
            for(var i=0; i<runner.cumTimes.length; i++) {
                if (runner.cumTimes[i] === pmMarker ) {
                    runner.legTimes.splice(i, 0, pmMarker);
                }
            }
            return runner;
        }
    };
    osplits.parser.Extractor.prototype.extract = function(s) {
        var tmp = s.slice(this.from, this.to);
        return tmp.trim();
    },
    osplits.tables = {
        initCtrlRanking : function() {
            var ctrlRanking = document.createElement('div');
            $(ctrlRanking).attr('id','ctrlRanking');
            var W = 300;
            var L = ($('body').get()[0].offsetWidth - W)/2;
            $(ctrlRanking).css({ display : 'none', left : L });

            var buttonClose = document.createElement('button');
            buttonClose.addEventListener('click',function(e) {
                document.getElementById('ctrlRanking').style.display = 'none';
            });
            buttonClose.innerText = chrome.i18n.getMessage('closeButton');
            ctrlRanking.appendChild(buttonClose);

            var title = document.createElement('p');
            $(title).attr('id','titleCtrlRanking');
            ctrlRanking.appendChild(title);

            var scrollable = document.createElement('div');

            var table = document.createElement('table');

            var thead = table.createTHead();

            var th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelRank');
            th.classList.add('right');
            thead.appendChild(th);

            th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelName');
            th.classList.add('left');
            thead.appendChild(th);

            th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelCategory');
            th.classList.add('left');
            thead.appendChild(th);

            th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelTime');
            th.classList.add('left');
            thead.appendChild(th);

            var tbody = document.createElement('tbody');
            $(tbody).attr('id','ctrlRankingTBody');
            table.appendChild(tbody);

            scrollable.appendChild(table);
            ctrlRanking.appendChild(scrollable);

            document.body.appendChild(ctrlRanking);

        },
        buildCtrlRanking : function(fromCtrl, toCtrl) {
            var title = document.getElementById('titleCtrlRanking');
            title.innerText = chrome.i18n.getMessage('titleCtrlRanking') + '\n' + fromCtrl + ' -> ' + toCtrl;

            var tbody = document.getElementById('ctrlRankingTBody');
            $('tbody#ctrlRankingTBody tr').remove();
            var query = 'SELECT r.id, r.name, r.club, r.category, t.legSec FROM time AS t, runner AS r WHERE t.runnerId = r.id AND t.fromCtrl = ? AND t.toCtrl = ? AND t.legSec < ? ORDER BY t.legSec, r.name';

                                    var result = osplits.webdb.selectAsObjects(query, [fromCtrl, toCtrl, osplits.util.VALUE_MP])
                var legPre, rankPre = undefined;
                    for (var i = 1; i <= result.length; i++) {
                        var line = result[i-1];
                        var time = line.legSec;
                        var rank = i;
                        if (time == legPre) {
                            rank = rankPre;
                        }
                        var runner = {rank : rank, name : line.name, category : line.category , time : time};
                        legPre = time;
                        rankPre = rank;
                        osplits.tables.buildRunnerForCtrlRanking(tbody,runner);
                    }
        },
        buildRunnerForCtrlRanking : function(tbody, runner) {
            var tr = document.createElement('tr');

            var td = document.createElement('td');
            td.innerText = runner.rank;
            tr.appendChild(td);

            var td = document.createElement('td');
            td.innerText = runner.name;
            tr.appendChild(td);

            var td = document.createElement('td');
            td.innerText = runner.category;
            tr.appendChild(td);

            var td = document.createElement('td');
            td.innerText = osplits.util.sec2str(runner.time);
            tr.appendChild(td);

            tbody.appendChild(tr);
        },
        displayCtrlRanking : function() {
            var ctrlRanking = document.getElementById('ctrlRanking');
            ctrlRanking.style.display = 'block';

        },
        onRunnerClicked : function(event) {
            var tbody = this;
            osplits.tables._onRunnerClicked(tbody);
        },
        _onRunnerClicked : function(tbody, forceSelected) {
            var table = tbody.parentElement;
            var circuitId = table.dataset['circuitId'];
            var runnerId = tbody.dataset['runnerId'];
            var graphObj = osplits.graph.circuits[circuitId];

            var show = forceSelected;
            if (forceSelected === undefined) {
                show = tbody.classList.toggle('selected');
            }
            else if (forceSelected) {
                tbody.classList.add('selected');
            }
            else {
                tbody.classList.remove('selected');
            }
            if (show) {
                graphObj.showRunner(runnerId);
            }
            else {
                graphObj.hideRunner(runnerId);
            }
        },
        onClubClicked : function(event) {
            var cell = this;
            var club = cell.innerText;
            var tbody = cell.parentElement.parentElement.parentElement;
            var isSelected = tbody.classList.contains('selected');
            var table = tbody.parentElement;
            var all = $(table).find('th.club:contains(' + club + ')').parent().parent();
            if (isSelected) {
                all = all.reverse();
            }
            all.each(function(index, elem) {
                osplits.tables._onRunnerClicked(elem, !isSelected);
            });
            event.stopPropagation();
        },
        onControlClicked : function(event) {
            var th = this;
            var fromCtrl = th.dataset['fromCtrl'];
            var toCtrl = th.dataset['toCtrl'];
            osplits.tables.buildCtrlRanking(fromCtrl,toCtrl);
            osplits.tables.displayCtrlRanking();
        },
        toggleRestricted: function(event) {
            var button = this;
            var table = $(button).parent().parent().find('table').get(0);
            if (table.classList.contains('restricted')) {
                $(table).find('tbody').show('fast', function(){
                    table.classList.remove('restricted');
                    button.innerText = chrome.i18n.getMessage('buttonFilterOn');
                });
            }
            else{
                $(table).find('tbody').not('.selected').hide(function(){
                    table.classList.add('restricted');
                    button.innerText = chrome.i18n.getMessage('buttonFilterOff');
                });
            }
        },
        _highlightBest: function(table, rowId, query){
            var cicuitId = table.dataset['circuitId'];
            table.dataset['best'] = rowId;
            $(table).find('.highlighted').removeClass('highlighted');
                var result = osplits.webdb.selectAsObjects(query, [cicuitId, cicuitId])
                    var count = result.length;
                    for(var i = 0; i < count; i++) {
                        var best = result[i];
                        var jq = 'tbody[data-runner-id="' + best.id + '"] tr[data-time="' + rowId + '"] td[data-ctrl-num="' + best.numInCircuit + '"]';
                        $(table).find(jq).addClass('highlighted');
                    }
        },
        QUERY_BEST_LEG: 'SELECT r.id, t1.numInCircuit FROM time AS t1, runner AS r WHERE t1.circuitId = ? AND t1.runnerId = r.id AND t1.legSec = (SELECT min( t2.legSec ) FROM time t2 WHERE t2.numInCircuit = t1.numInCircuit AND t2.circuitId = ? GROUP BY t2.numInCircuit) order by t1.numInCircuit;',
        QUERY_BEST_CUM: 'SELECT r.id, t1.numInCircuit FROM time AS t1, runner AS r WHERE t1.circuitId = ? AND t1.runnerId = r.id AND t1.cumSec = (SELECT min( t2.cumSec ) FROM time t2 WHERE t2.numInCircuit = t1.numInCircuit AND t2.circuitId = ? GROUP BY t2.numInCircuit) order by t1.numInCircuit;',
        toggleHighlightBest: function(event) {
            var button = this;
            var table = $(button).parent().parent().find('table').get(0);
            var curr = table.dataset['best'];
            switch (curr) {
            case 'leg':
                button.innerText = chrome.i18n.getMessage('buttonBestLeg');
                osplits.tables._highlightBest(table, 'cum', osplits.tables.QUERY_BEST_CUM);
                break;
            case 'cum':
                button.innerText = chrome.i18n.getMessage('buttonBestCum');
                osplits.tables._highlightBest(table, 'leg', osplits.tables.QUERY_BEST_LEG);
                break;
            }
        },
        toggleDisplay : function() {
            if (osplits.parser.OURDIV) {
                console.log("O'Splits: reverting to original");
                osplits.parser.PARENT.removeChild(osplits.parser.OURDIV);
                osplits.parser.OURDIV = null;
                window.location.reload();
            } else {
                console.log("O'Splits: showing tables");
                osplits.parser.PARENT.removeChild(osplits.parser.BACKUP);
                osplits.parser.BACKUP = null;
                var styles = document.head.getElementsByTagName('style');
                for (var i = 0; i < styles.length; i++) {
                    document.head.removeChild(styles[i]);
                }
                osplits.tables.generateTables();
            }
        },
        onCompleted : function() {
            osplits.parser.PARENT.appendChild(osplits.parser.OURDIV);
        },
        generateOneCircuit : function(isLast, circuit) {
            var container = document.createElement('div');
            container.classList.add('container');

            var caption = document.createElement('h1');
            container.appendChild(caption);
            caption.innerText = circuit.description;

            var button = document.createElement('button');
            button.innerText = chrome.i18n.getMessage('buttonFilterOn');
            button.addEventListener('click', osplits.tables.toggleRestricted);
            caption.appendChild(button);

            button = document.createElement('button');
            button.innerText = chrome.i18n.getMessage('buttonBestCum');
            button.addEventListener('click', osplits.tables.toggleHighlightBest);
            caption.appendChild(button);

            button = document.createElement('button');
            button.innerText = chrome.i18n.getMessage('buttonShowGraph');
            button.addEventListener('click', osplits.graph.toggleGraph);
            caption.appendChild(button);

            var scrollable = document.createElement('div');
            container.appendChild(scrollable);
            scrollable.classList.add('scrollable');

            var table = document.createElement('table');
            scrollable.appendChild(table);
            table.dataset['circuitId'] = circuit.id;

            var thead = table.createTHead();

            var th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelRank');
            th.classList.add('right');
            thead.appendChild(th);

            th = document.createElement('th');
            th.innerText = chrome.i18n.getMessage('labelName');
            th.classList.add('left');
            thead.appendChild(th);

            if (osplits.parser.HEADLINE.category) {
                th = document.createElement('th');
                th.innerText = chrome.i18n.getMessage('labelCategory');
                th.classList.add('left');
                thead.appendChild(th);
            }
                var ctrlResult = osplits.webdb.selectAsObjects('select * from time where circuitId = ? group by numInCircuit;', [circuit.id])
                if (circuit.ctrlCount + 1 !== ctrlResult.length) {
                    console.error("Control count mismatch! Got=" + circuit.ctrlCount + 1 + ", Exp=" + ctrlResult.length);
                }
                for (var j = 0; j < ctrlResult.length; j++) {
                    var ctrl = ctrlResult[j];
                    th = document.createElement('td');
                    th.innerHTML = ctrl.numInCircuit + '&nbsp;<span class="ctrlid">' + ctrl.toCtrl + '</span>';
                    th.classList.add('right');
                    th.classList.add('clickable');
                    th.dataset['fromCtrl'] = ctrl.fromCtrl;
                    th.dataset['toCtrl'] = ctrl.toCtrl;
                    th.addEventListener('click', osplits.tables.onControlClicked);
                    thead.appendChild(th);
                }

                var timeResults = osplits.webdb.selectAsObjects('select r.id, r.rank, r.name, r.club, r.category, t.numInCircuit, t.legSec, t.cumSec from time as t, runner as r where t.circuitId = ? and t.runnerId = r.id order by r.rank, r.id, t.numInCircuit;', [circuit.id])
                    var timeResultsCount = timeResults.length;
                    var ctrlCount = circuit.ctrlCount + 1;
                    for (var k=0; k < timeResultsCount; k += ctrlCount) {
                        var line = timeResults[k];
                        var runner = {
                            id: line.id,
                            rank: line.rank,
                            name: line.name,
                            club: line.club,
                            category: line.category,
                            ctrlNum: [],
                            legSec: [],
                            cumSec: []
                        };
                        for(var kk=0; kk < ctrlCount; kk++) {
                            runner.ctrlNum[kk] = timeResults[k+kk].numInCircuit;
                            runner.legSec[kk] = timeResults[k+kk].legSec;
                            runner.cumSec[kk] = timeResults[k+kk].cumSec;
                        }
                        var isRunnerLast = isLast && k === timeResultsCount - ctrlCount;
                        osplits.tables.generateOneRunner(isRunnerLast, table, runner);
                    }
            osplits.parser.OURDIV.appendChild(container);
            osplits.tables._highlightBest(table, 'leg', osplits.tables.QUERY_BEST_LEG);
            osplits.graph.circuits[circuit.id] = osplits.graph.createGraphObject(table);
        },
        generateOneRunner: function(isRunnerLast, table, runner) {
            var tbody, th, tr, td = undefined;
            tbody = table.createTBody();
            tbody.dataset['runnerId'] = runner.id;
            tbody.addEventListener('click', osplits.tables.onRunnerClicked);
            tr = document.createElement('tr');
            tr.dataset['time'] = 'leg';
            tbody.appendChild(tr);

            th = document.createElement('th');
            var rank = runner.rank;
            if (rank >= osplits.util.VALUE_MP) {
                th.innerText = chrome.i18n.getMessage('mp');
            } else {
                th.innerText = runner.rank;
            }
            th.classList.add('right');
            tr.appendChild(th);

            th = document.createElement('th');
            th.innerText = runner.name;
            th.classList.add('left');
            tr.appendChild(th);

            if (osplits.parser.HEADLINE.category) {
                th = document.createElement('th');
                th.innerText = runner.category;
                th.classList.add('left');
                tr.appendChild(th);
            }
            // leg
            for ( var t = 0; t < runner.legSec.length; t++) {
                td = document.createElement('td');
                td.dataset['ctrlNum'] = runner.ctrlNum[t];
                td.innerText = osplits.util.sec2str(runner.legSec[t]);
                td.classList.add('right');
                td.title = runner.name + " @ " + runner.ctrlNum[t];
                tr.appendChild(td);
            }
            if (runner.legSec.length) {
                td.classList.add('last');
            }
            // cumulated
            tr = document.createElement('tr');
            tr.dataset['time'] = 'cum';
            tbody.appendChild(tr);
            th = document.createElement('th');
            var square = document.createElement('div');
            square.classList.add('square');
            square.style.backgroundColor = osplits.graph.getColor(runner.id);
            th.classList.add('right');
            th.appendChild(square);
            tr.appendChild(th);
            th = document.createElement('th');
            var span = document.createElement('span');
            span.innerText = runner.club;
            span.classList.add('clickable');
            span.addEventListener('click', osplits.tables.onClubClicked);
            th.classList.add('club');
            th.classList.add('left');
            th.appendChild(span);
            tr.appendChild(th);
            // place holder for category
            if (osplits.parser.HEADLINE.category) {
                th = document.createElement('th');
                tr.appendChild(th);
            }
            for ( var t = 0; t < runner.cumSec.length; t++) {
                td = document.createElement('td');
                td.dataset['ctrlNum'] = runner.ctrlNum[t];
                td.innerText = osplits.util.sec2str(runner.cumSec[t]);
                td.classList.add('right');
                td.title = runner.name + " @ " +  runner.ctrlNum[t];
                tr.appendChild(td);
            }
            if (runner.cumSec.length) {
                td.classList.add('last');
                td.classList.add('total');
            }
            if (isRunnerLast){
                osplits.tables.onCompleted();
            }
        },
        generateTables : function() {
            osplits.parser.OURDIV = document.createElement('div');
            osplits.parser.OURDIV.id = 'osplits';

                var results = osplits.webdb.selectAsObjects('SELECT * from circuit ORDER BY number;', null)
                for(var i = 0; i < results.length; i++) {
                        var circuit = results[i];
                        var isLast = i === results.length - 1;
                        osplits.tables.generateOneCircuit(isLast, circuit);
                    }
        }
    };
    osplits.graph = {
        width : 1000,
        height : 500,
        yAxisWidth : 0,
        circuits : {},
        getColor : function(i) {
            var hue = [ 0, 40, 110, 190, 240, 300 ];
            var sat = [ 55, 70, 85, 100 ];
            var lum = [ 40, 55, 70 ];
            var turns = parseInt(i / hue.length);
            var h = (hue[i % hue.length] + 10 * turns) % 360;
            var s = sat[turns * i % sat.length];
            var l = lum[turns * i % lum.length];
            return 'hsl(' + h + ',' + s + '%,' + l + '%)';
        },
        createGraphObject : function(table) {
            var circuitId = parseInt(table.dataset.circuitId);
            var bestTotal = 0;
            var worstTotal = 0;
            var totalTimes = {};
            var bestCumSec = [];
            var xAxis = [];
            var runnerPlots = {};
            var getWorst = function() {
                var w = 0;
                for (var rid in runnerPlots) {
                    if (runnerPlots.hasOwnProperty(rid)) {
                        var total = totalTimes[rid];
                        if (total > w && total < osplits.util.VALUE_MP) {
                            w = total;
                        }
                    }
                }
                return w;
            };
            var graphLayers = document.createElement('div');
            graphLayers.classList.add('graph');
            var backgroundCanvas = document.createElement('canvas');
            graphLayers.appendChild(backgroundCanvas);
            backgroundCanvas.width = osplits.graph.width;
            backgroundCanvas.height = osplits.graph.height;
            var backgroundCtx = backgroundCanvas.getContext('2d');
            backgroundCtx.font = '13pt';
            backgroundCtx.textAlign = 'right';
            osplits.graph.yAxisWidth = backgroundCtx.measureText('100:59').width;
            var seconds2x = function(s) {
                return parseInt(s * osplits.graph.width / bestTotal);
            };
            var seconds2y = function(s) {
                return parseInt(s * osplits.graph.height / (worstTotal - bestTotal));
            };

            var plotRunner = function(runnerId, ctx, timeRows) {
                ctx.strokeStyle = osplits.graph.getColor(runnerId);
                ctx.lineWidth = 2;
                var x=0,y=0, dashed=false;
                ctx.beginPath();
                ctx.moveTo(x, y);
                for (var j = 0; j < timeRows.length; j++) {
                    var cumSec = timeRows[j].cumSec;
                    if (cumSec >= osplits.util.VALUE_MP) {
                        dashed=true;
                        if ( x > 0 ) {
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(x, y);
                            ctx.setLineDash([2,4]);
                        }
                        while (j < timeRows.length - 1 && cumSec >= osplits.util.VALUE_MP) {
                            j++;
                            cumSec = timeRows[j].cumSec;
                        }
                    }
                    else if (dashed){
                        dashed=false;
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.setLineDash([]);
                    }
                    if ( cumSec < osplits.util.VALUE_MP ) {
                        // Check for the case where even the A is not punched
                        var delta = cumSec - bestCumSec[j];
                        x = xAxis[j];
                        y = seconds2y(delta);
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                var total = timeRows[timeRows.length-1].cumSec;
                if ( total <  osplits.util.VALUE_MP ) {
                    var cumLostTotalSec = total-bestTotal;
                    var cumLostMn = (cumLostTotalSec/60) << 0;
                    var cumLostSec = cumLostTotalSec%60;
                    var lostText = '' + cumLostMn + ":" + (cumLostSec < 10 ? '0' : '') + cumLostSec;
                    ctx.font = '13pt';
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#0A0A0A';
                    x = osplits.graph.width;
                    y = seconds2y(cumLostTotalSec);
                    ctx.fillText(lostText, x, y);
                }

            };
                var result = osplits.webdb.selectAsObjects("SELECT runnerId, cumSec FROM time WHERE circuitId = ? AND toCtrl = 'A';", [ circuitId ])


                        for (var i = 0; i < result.length; i++) {
                            var t = result[i];
                            totalTimes[t.runnerId] = t.cumSec;
                        }
                var result = osplits.webdb.selectAsObjects('SELECT min( t.legSec ) AS best, t.numInCircuit AS num FROM time t WHERE t.circuitId = ? GROUP BY t.numInCircuit ORDER BY t.numInCircuit;',[ circuitId ])
                                    var previous = 0;
                                    for (var i = 0; i < result.length; i++) {
                                        var t = result[i];
                                        bestTotal += t.best;
                                        bestCumSec.push(bestTotal);
                                    }
                                    var skipLabel = false;
                                    for (var i = 0; i < result.length; i++) {
                                        var t = result[i];
                                        var w = seconds2x(t.best);
                                        backgroundCtx.fillStyle = i % 2 ? '#F1F1F1' : '#E5E5E5';
                                        backgroundCtx.fillRect(previous, 0, w, osplits.graph.height);
                                        previous += w;

                                        // label
                                        var label = '' + t.num;
                                        backgroundCtx.fillStyle = '#0A0A0A';
                                        var metrics = backgroundCtx.measureText(label);
                                        var width = metrics.width;
                                        if (width > w && !skipLabel) {
                                            // skip this label...
                                            skipLabel = true;
                                        }
                                        else {
                                            skipLabel = false;
                                            backgroundCtx.fillText(label, previous, osplits.graph.height);
                                        }
                                        xAxis.push(previous);
                                    }

            var buildRunnerCanvas = function(runnerId, callback) {
                        var result = osplits.webdb.selectAsObjects('SELECT t.cumSec FROM time t WHERE t.circuitId = ? and t.runnerId = ? ORDER BY t.numInCircuit;', [ circuitId, runnerId ])
                        var c = document.createElement('canvas');
                        c.width = osplits.graph.width + osplits.graph.yAxisWidth;
                        c.height = osplits.graph.height;
                        var ctx = c.getContext('2d');
                        plotRunner(runnerId, ctx, result);
                        callback(c);
            };
            var deletePlot = function(runnerId) {
                if (runnerPlots.hasOwnProperty(runnerId)) {
                    var plot = runnerPlots[runnerId];
                    if (plot.canvas) {
                        graphLayers.removeChild(plot.canvas);
                    }
                    delete runnerPlots[runnerId];
                }
            };
            return {
                rescaleAllPlots : function() {
                    var graphObj = this;
                    // Clear first
                    for (var runnerId in runnerPlots) {
                        deletePlot(runnerId);
                    }
                    // Reverse the runner to scale fewer times than for each selected runner
                    $(table).find('tbody.selected').reverse().each(function(index, elem) {
                        var runnerId = elem.dataset['runnerId'];
                        graphObj.showRunner(runnerId);
                    });
                },
                hideRunner: function(runnerId){
                    deletePlot(runnerId);
                    if (totalTimes[runnerId] === worstTotal) {
                        // compute new worst and then clear and repaint
                        worstTotal = getWorst();
                        this.rescaleAllPlots();
                    }
                },
                showRunner: function(runnerId){
                    var plot = runnerPlots[runnerId];
                    if (!plot) {
                        plot = {canvas: null};
                        runnerPlots[runnerId] = plot;
                    }
                    var totalTime = totalTimes[runnerId];
                    if (totalTime < osplits.util.VALUE_MP && totalTime > worstTotal) {
                        worstTotal = totalTime;
                        this.rescaleAllPlots();
                    }
                    else {
                        var _showCanvas = function(canvas) {
                            // Because buildRunnerCanvas runs SQL, it can
                            // call us after another showRunner() is called,
                            // possibly rescaling... which deletes our entry
                            // in runnerPlots, so check that this was not
                            // the case by keeping a closure on 'plot'
                            if (runnerPlots[runnerId] === plot) {
                                plot.canvas = canvas;
                                graphLayers.appendChild(canvas);
                            }
                        };
                        buildRunnerCanvas(runnerId, _showCanvas);
                    }
                },
                hide : function() {
                    table.parentElement.removeChild(graphLayers);
                },
                show : function() {
                    table.parentElement.appendChild(graphLayers);
                }
            };
        },
        toggleGraph: function(event) {
            var button = this;
            var table = $(button).parent().parent().find('table').get(0);
            var circuitId = parseInt(table.dataset.circuitId);
            var container = button.parentElement.parentElement;

            if (container.classList.toggle('graphMode')) {
                var graphObj = osplits.graph.circuits[circuitId];
                graphObj.show();
                button.innerText = chrome.i18n.getMessage('buttonShowTable');
                $(table).find('td').not('.last').hide();
                var totalElem = $(table).find('.total').filter(":visible").get(0);
                var graphLeft = totalElem.offsetLeft + totalElem.offsetWidth + 18; // +scrollbar
                $(container).find('.graph').css('left', (graphLeft + 20) + 'px');
                $(container).find('.scrollable').width(function(i, elem){
                    return graphLeft;
                });
            }
            else {
                $(table).find('td').show();
                button.innerText = chrome.i18n.getMessage('buttonShowGraph');
                osplits.graph.circuits[circuitId].hide();
            }
        }
    };

    window.osplits = osplits;
    window.addEventListener("message", function(event) {
        // We only accept messages from ourselves
        if (event.source != window)
          return;
        var msg = event.data;
        console.log("O'Splits: contentscript receiving window msg:" + msg.cmd);
        if(msg.cmd==='jsonDataReady') {
            osplits.parser.BACKUP = document.getElementById('gecoResults');
            osplits.parser.PARENT = osplits.parser.BACKUP.parentElement;
            osplits.parser.LANG = osplits.parser.LANGS.fr;
            var found = osplits.parser.storeJson(msg.data);
            console.log("O'Splits: Received JSON & found " + found + " circuits");
            chrome.runtime.sendMessage({cmd:'parseok', count:found });
        }
    });
    chrome.runtime.onMessage.addListener(function(msg) {
        jQuery.fn.reverse = jQuery.fn.reverse || [].reverse;
        console.log("O'Splits: contentscript receiving chrome msg:" + msg.cmd);
        switch (msg.cmd) {
        case 'parse':
            osplits.parser.BACKUP = document.getElementsByTagName('pre')[0];
            osplits.parser.PARENT = osplits.parser.BACKUP.parentElement;
            osplits.parser.LANG = osplits.parser.LANGS.fr;

            var found = osplits.parser.parseDocument();
            console.log("O'Splits: Parsing document found " + found + " circuits");
            chrome.runtime.sendMessage({cmd:'parseok', count:found });
            break;
        case 'readJson':
            osplits.parser.BACKUP = document.getElementById('gecoResults');
            osplits.parser.PARENT = osplits.parser.BACKUP.parentElement;
            osplits.parser.LANG = osplits.parser.LANGS.fr;
            var found = 0;
            if(window.gecoOrienteeringResults.version === 1) {
                found = osplits.parser.storeJsonV1(window.gecoOrienteeringResults);
            }
            else {
                found = osplits.parser.storeJson(window.gecoOrienteeringResults);
            }
            console.log("O'Splits: Read JSON & found " + found + " circuits");
            chrome.runtime.sendMessage({cmd:'parseok', count:found });
            break;
        case 'loadJsonData':
            // This is the 2nd Geco scheme => send to HTML page
            window.postMessage({cmd:'loadJsonData'}, '*');
            break;
        case 'loadJsonDataV3':
            // This is the 3rd Geco scheme => directly load the JS
            var s = document.createElement("script");
            s.type = "text/javascript";
            s.src = window.location.pathname.substring(location.pathname.lastIndexOf('/')+1, location.pathname.lastIndexOf('.')) + '.js'
            document.body.appendChild(s);
            break;
        case 'showtables':
            osplits.tables.toggleDisplay();
            osplits.tables.initCtrlRanking();
            break;
        }

    });
}