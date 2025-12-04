"use strict";

const device_id = $('#device_id').val();
const base_url = $('#base_url').val();
const device_status = $('#device_status').val();
var attampt = 0;
var session_attampt = 0;

checkSession();

//create session request for this device
function createSession(params = {}) {

	attampt++;

	if (attampt == 6 && !params.typeAuth) {
		clearInterval(sessionMake);
		const image = `<img src="${base_url}/uploads/waiting.jpeg" class="w-50">`;
		$('.qr-area').html(image);
		Swal.fire({
			title: 'Opps!',
			text: "Time Expired For Logged In Please Reload This Page",
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#3085d6',
			cancelButtonColor: '#d33',
			confirmButtonText: 'Close',
			confirmButtonText: 'Refresh This Page'
		}).then((result) => {
			if (result.value == true) {
				location.reload();
			}
		});
		return false;
	}
	$.ajaxSetup({
		headers: {
			'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
		}
	});

	const data = {
		typeAuth: params.typeAuth || 'qr',
		phoneNumber: params.phoneNumber || ''
	};

	//sending ajax request
	$.ajax({
		type: 'POST',
		url: base_url + '/user/create-session/' + device_id,
		data: data,
		dataType: 'json',
		success: function (response) {
			if (response.qr) {
				const image = `<img src="${response.qr}" class="w-90">`;
				$('.qr-area').html(image);
			} else if (response.code) {
				$('#pairing-code-display').text(response.code);
				// format code like XXX-XXX
				const formatted = response.code.match(/.{1,4}/g).join('-');
				$('#pairing-code-display').text(formatted);
			}
			$('.server_disconnect').hide();
			$('.progress').show();

		},
		error: function (xhr, status, error) {

			const image = `<img src="${base_url}/uploads/disconnect.webp" class="w-50"><br>`;
			$('.qr-area').html(image);
			$('.server_disconnect').show();

			if (xhr.status == 500) {
				clearInterval(checkSessionRecurr);
				clearInterval(sessionMake);
			}
		}
	});
}

$('#use-pairing-code').on('click', function () {
	clearInterval(sessionMake);
	$('.qr-area').addClass('d-none');
	$('.pairing-code-area').removeClass('d-none');
	$('#use-pairing-code').addClass('d-none');
	$('#use-qr-code').removeClass('d-none');
});

$('#use-qr-code').on('click', function () {
	$('.qr-area').removeClass('d-none');
	$('.pairing-code-area').addClass('d-none');
	$('#use-pairing-code').removeClass('d-none');
	$('#use-qr-code').addClass('d-none');
	// Restart QR interval
	createSession();
	sessionMake = setInterval(function () {
		createSession();
	}, 12000);
});

$('#get-pairing-code').on('click', function () {
	const phone = $('#phone-number').val();
	if (!phone) {
		alert('Please enter a phone number');
		return;
	}
	createSession({ typeAuth: 'code', phoneNumber: phone });
});

//check is device logged in
function checkSession() {
	session_attampt++;
	if (session_attampt >= 60) {
		clearInterval(checkSessionRecurr);
		return false;
	}

	$.ajaxSetup({
		headers: {
			'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
		}
	});
	$.ajax({
		type: 'POST',
		url: base_url + '/user/check-session/' + device_id,
		dataType: 'json',
		success: function (response) {
			if (response.connected === true) {
				clearInterval(checkSessionRecurr);
				clearInterval(sessionMake);

				NotifyAlert('success', null, response.message);
				$('.loggout_area').show();


				const image = `<img src="${base_url}/uploads/connected.png" class="w-50"><br>`;
				$('.qr-area').html(image);

				$('.logged-alert').show();
				$('.progress').hide();
				$('.helper-box').show();

				device_status == '0' ? congratulations() : '';
			}
			else {
				session_attampt == 1 ? createSession() : '';
			}
		},
		error: function (xhr, status, error) {
			if (xhr.status == 500) {
				clearInterval(checkSessionRecurr);
				clearInterval(sessionMake);
				const image = `<img src="${base_url}/uploads/disconnect.webp" class="w-50"><br>`;
				$('.qr-area').html(image);
				$('.server_disconnect').show();
			}

		}
	});
}


//if click logout button
$('.logout-btn').on('click', function () {

	Swal.fire({
		title: 'Are you sure want to logout?',
		text: "Once make logout you have to make login useing qr",
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		cancelButtonText: 'No Please',
		confirmButtonText: 'Yes make logout'
	}).then((result) => {
		if (result.value == true) {
			let previous_btn = $('.logout-btn').html();

			$.ajaxSetup({
				headers: {
					'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
				}
			});
			$.ajax({
				type: 'POST',
				url: base_url + '/user/logout-session/' + device_id,
				dataType: 'json',
				beforeSend: function () {
					$('.logout-btn').html('<i class="fas fa-spinner"><i>&nbspPlease Wait...');
					$('.logout-btn').attr('disabled', '');
				},
				success: function (response) {
					NotifyAlert('success', null, response.message);
					$('.logout-btn').html(previous_btn);
					$('.logout-btn').hide();
					$('.logout-btn').removeAttr('disabled');

					location.reload();
				},
				error: function (xhr, status, error) {
					NotifyAlert('error', xhr);
					$('.logout-btn').html(previous_btn);
					$('.logout-btn').removeAttr('disabled');

				}
			});
		}

	});


});

var sessionMake = setInterval(function () {
	createSession();
}, 12000);

const checkSessionRecurr = setInterval(function () {
	checkSession();
}, 5000);

