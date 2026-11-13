// Load the verion of the website
fetch("./version.json")
	.then(response => {
		if (!response.ok){
			throw new Error(`HTTP error: ${response.status}`)
		}

		return response.json();
	})
	.then(data => {
		document.querySelector("#webversion").textContent = data.version
	})
	.catch(error => {
		console.error("Impossible de récupérer la version :", error);
	})
