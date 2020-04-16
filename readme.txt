Student:    Colin Lacey
StudentID:  10153069

To run: 
	Ensure all all required modules are installed. 
	If you have npm, this can be done from the top level folder "connect4" by executing "nom install".
	
	From the top level folder, use the command "node index" to start the server.
	Once this is done, you can navigate to http://localhost:3000/ in a web browser.
	
Notes: 
	Game initialization depends on the browser's cookies at game start up (when the browser is redirected to "game.html"). 
	For this reason, it's not possible to play games between different tabs in the same browser. 
	What is possible, is to play an arbitrary number of games between different tabs in two different browser windows. 
	For instance, you can open Chrome and Firefox windows and play as many games in as many tabs as you like at the same time,
	as long as each Chrome tab player is playing / connected to a Firefox tab player.

	Otherwise the game should be self explanatory. 
	You can hover your cursor over any column while the game is active, and if it's your turn and the column is playable (not full), 
	a circle will appear over the column indicating that it can be clicked/played. 
