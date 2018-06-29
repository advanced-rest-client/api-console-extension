'use strict';

const assert = require('chai').assert;
const ApiConsoleOauthProxy =
  require('../js/background.js').ApiConsoleOauthProxy;

describe('api-console-extension', function() {
  describe('OAuth2 proxy', function() {
    describe('popup-url', function() {
      let proxy;
      let settings;
      let popupUrl;
      before(function() {
        settings = {
          authorizationUrl: 'https://authorizationUrl.com',
          clientId: 'test-123 test',
          redirectUrl: 'https://redirectUrl.com',
          scopes: ['scope-1', 'scope-2']
        };
        proxy = new ApiConsoleOauthProxy(settings);
        popupUrl = proxy._constructPopupUrl(settings, 'token');
      });
      /**
       * @param {String} name
       * @return {String}
       */
      function getParam(name) {
        const _url = popupUrl.substr(popupUrl.indexOf('?') + 1);
        const parts = _url.split('&');
        for (let i = 0, len = parts.length; i < len; i++) {
          let params = parts[i].split('=');
          if (params[0] === name) {
            return params[1];
          }
        }
      }

      it('Constructs OAuth URL', function() {
        assert.isString(popupUrl);
      });

      it('Sets authorization URL and response_type', function() {
        const base = settings.authorizationUrl + '?response_type=token';
        const index = popupUrl.indexOf(base);
        assert.equal(index, 0);
      });

      it('Sets client_id', function() {
        const clientId = getParam('client_id');
        assert.equal(clientId, 'test-123%20test');
      });

      it('Sets redirect_uri', function() {
        const redirectUrl = getParam('redirect_uri');
        assert.equal(redirectUrl, 'https%3A%2F%2FredirectUrl.com');
      });

      it('Sets scope', function() {
        const scopes = getParam('scope');
        assert.equal(scopes, 'scope-1%20scope-2');
      });

      it('Sets state', function() {
        const state = getParam('state');
        assert.isString(state);
      });
    });

    describe('authDataFromUrl', function() {
      let authData;
      let token;
      let tokenType;
      let expiresIn;
      let state;

      before(function() {
        const settings = {
          authorizationUrl: 'https://authorizationUrl.com',
          clientId: 'test-123 test',
          redirectUrl: 'https://redirectUrl.com',
          scopes: ['scope-1', 'scope-2']
        };
        token = 'ya29.GlwpBBGitx7n81P6Jdu1l43Y0M_j7WD0uVQRc3H1v6PyL0Ob6H6UrsWj';
        token += '-rTMxXtX66_cdEbRJwHyArtR79GIGnIYfhcOBMt8qH96e9oGswGaGPkb1eg';
        token += 'RZ5UIf_qzFQ';
        tokenType = 'Bearer';
        state = '173mwy';
        expiresIn = '3600';
        const proxy = new ApiConsoleOauthProxy(settings);
        let url = 'http://localhost:8080/components/oauth-authorization/oauth-popup.html';
        url += '#state=' + state;
        url += '&access_token=' + token;
        url += '&token_type=' + tokenType;
        url += '&expires_in=' + expiresIn;
        authData = proxy.authDataFromUrl(url);
      });

      it('Has accessToken', function() {
        assert.isString(authData.accessToken, 'accessToken is string');
        assert.equal(authData.accessToken, token, 'Token value equals');
      });

      it('Has accessToken', function() {
        assert.isString(authData.expiresIn, 'expiresIn is string');
        assert.equal(authData.expiresIn, expiresIn,
          'expiresIn equals ' + expiresIn);
      });

      it('Has state', function() {
        assert.isString(authData.state, 'state is string');
        assert.equal(authData.state, state, 'state equals ' + state);
      });

      it('Has tokenType', function() {
        assert.isString(authData.tokenType, 'tokenType is string');
        assert.equal(authData.tokenType, tokenType,
          'tokenType equals ' + tokenType);
      });
    });
  });
});
