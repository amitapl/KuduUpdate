var cli = require('azure-cli');
var sinon = require('sinon');
var request = require('request');
var fs = require('fs');
var colors = require('colors');

var usePrivateKuduKey = 'USE_PRIVATE_KUDU';

var siteName;
var zipFilePath;
var serviceUri;
var username;
var password;
var configuration;

function main() {
  if (process.argv.length != 4) {
    exitWithError('Usage: kuduUpdate [site name] [zip file path]');
  }

  zipFilePath = process.argv[3];

  if (!fs.existsSync(zipFilePath)) {
    exitWithError('File not found - ' + zipFilePath);
  }

  siteName = process.argv[2];

  ensureDeploymentUrl(function () {
    updateKudu();
  });
}

function updateKudu() {
  clearUsePrivateKuduConfiguration(function () {
    uploadZip(function () {
      setUsePrivateKuduConfiguration();
    });
  });
}

function ensureDeploymentUrl(callback) {
  var site = cli.category('site');

  var context = {
    subscription: cli.category('account').lookupSubscriptionId(),
    site: {
      name: siteName
    }
  };

  site.lookupSiteNameAndWebSpace(context, function (err) {
    if (err) {
      exitWithError(err);
    }

    site.doSiteConfigGet(context, function(err, result) {
      if (err) {
        exitWithError(err);
      }
      configuration = result;

      site.ensureRepositoryUri(context, function (err, deploymentUrl) {
        handleCallback(err, function () {
          serviceUri = context.repositoryUri;
          var auth = context.repositoryAuth.split(':');
          username = auth[0];
          password = auth[1];

          callback();
        });
      });
    });
  });
}

function clearUsePrivateKuduConfiguration(callback) {
  // Clear configuration only if it exists
  var jsonConfiguration = JSON.stringify(configuration);
  var index = jsonConfiguration.toUpperCase().indexOf(usePrivateKuduKey);
  if (index !== -1) {
    var usePrivateKuduName = jsonConfiguration.substr(index, usePrivateKuduKey.length);

    console.log('--> Clearing USE_PRIVATE_KUDU setting');
    executeAzureCliCommand(['site', 'config', 'clear', usePrivateKuduName, siteName], function (e) {
      handleCallback(e, callback);
    });
  }
  else {
    callback();
  }
}

function setUsePrivateKuduConfiguration(callback) {
  console.log('--> Setting USE_PRIVATE_KUDU setting');
  executeAzureCliCommand(['site', 'config', 'add', usePrivateKuduKey + '=1', siteName], function (e) {
    handleCallback(e, callback);
  });
}

function uploadZip(callback) {
  console.log('--> Uploading kudu service zip file - ' + zipFilePath);

  var putRequest = request({
    method: 'PUT',
    uri: serviceUri + 'zip',
    auth: {
      user: username,
      pass: password
    }
  }, function (error, response, body) {
    if (response.statusCode != 200) {
      console.log('Status code - ' + response.statusCode);
      if (body) {
        console.log(body);
      }
    }
    else if (error) {
      console.log('error - ' + error);
    }
    else {
      callback();
      return;
    }

    exitWithError();
  });

  fs.createReadStream(zipFilePath).pipe(putRequest);
}

function executeAzureCliCommand(cmd, cb) {
  var sandbox = sinon.sandbox.create();

  cmd.unshift('');
  cmd.unshift('');

  sandbox.stub(process, 'exit', function (exitStatus) {
    var result = null;
    if (exitStatus !== 0) {
      result = 'Error';
    }

    sandbox.restore();

    return cb(result);
  });

  cli.parse(cmd);
}

function handleCallback(e, callback) {
  if (e) {
    exitWithError(e);
  }

  if (callback) {
    callback();
  }
}

function exitWithError(err) {
  if (err) {
    var message = err.message || err;
    console.error(message.red);
  }
  process.exit(1);
}
exports.main = main;
