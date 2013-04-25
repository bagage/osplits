'use strict';
var tabs={};

chrome.pageAction.onClicked.addListener(function(tab) {
	chrome.tabs.sendMessage(tab.id, {
		cmd : 'showtables'
	});
});


function onMessage(msg, sender) {
	var tabid = sender.tab.id;
	
	switch (msg.cmd) {
	case 'oedetected':
		console.log("O'Splits: OE document detected, injecting script");
	    chrome.tabs.executeScript(tabid, {file:'/js/contentscript.js'}, function() {
	    	chrome.tabs.sendMessage(tabid, {cmd:'parse'});
	    });
		break;
	case 'parseok':
		console.log("O'Splits: OE document detected with " + msg.count + " circuits");
		if (msg.count) {
			chrome.tabs.insertCSS(tabid, {
				file : '/stylesheets/splitochrome.css'
			});
			chrome.pageAction.show(tabid);
		}
		break;
	}

	
};
// Listen for the content script to send a message to the background page.
chrome.extension.onMessage.addListener(onMessage);
