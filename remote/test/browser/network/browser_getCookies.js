/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SJS_PATH = "/browser/remote/test/browser/network/sjs-cookies.sjs";

const DEFAULT_HOST = "http://example.org";
const ALT_HOST = "http://example.net";
const SECURE_HOST = "https://example.com";

const DEFAULT_URL = `${DEFAULT_HOST}${SJS_PATH}`;

add_task(async function noCookiesWhenNoneAreSet({ Network }) {
  const { cookies } = await Network.getCookies({ urls: [DEFAULT_HOST] });
  is(cookies.length, 0, "No cookies have been found");
});

add_task(async function noCookiesForPristineContext({ Network }) {
  await loadURL(DEFAULT_URL);

  try {
    const { cookies } = await Network.getCookies();
    is(cookies.length, 0, "No cookies have been found");
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function allCookiesFromHostWithPort({ Network }) {
  const PORT_URL = `${DEFAULT_HOST}:8000${SJS_PATH}?name=id&value=1`;
  await loadURL(PORT_URL);

  const cookie = {
    name: "id",
    value: "1",
  };

  try {
    const { cookies } = await Network.getCookies();
    is(cookies.length, 1, "All cookies have been found");
    assertCookie(cookies[0], cookie);
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function allCookiesFromCurrentURL({ Network }) {
  await loadURL(`${ALT_HOST}${SJS_PATH}?name=user&value=password`);
  await loadURL(`${DEFAULT_URL}?name=foo&value=bar`);
  await loadURL(`${DEFAULT_URL}?name=user&value=password`);

  const cookie1 = { name: "foo", value: "bar", domain: "example.org" };
  const cookie2 = { name: "user", value: "password", domain: "example.org" };

  try {
    const { cookies } = await Network.getCookies();
    cookies.sort((a, b) => a.name.localeCompare(b.name));
    is(cookies.length, 2, "All cookies have been found");
    assertCookie(cookies[0], cookie1);
    assertCookie(cookies[1], cookie2);
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function secure({ Network }) {
  await loadURL(`${SECURE_HOST}${SJS_PATH}?name=foo&value=bar&secure`);

  const cookie = {
    name: "foo",
    value: "bar",
    domain: "example.com",
    secure: true,
  };

  try {
    // Cookie returned for secure protocols
    let result = await Network.getCookies();
    is(result.cookies.length, 1, "The secure cookie has been found");
    assertCookie(result.cookies[0], cookie);

    // For unsecure protocols no secure cookies are returned
    await loadURL(DEFAULT_URL);
    result = await Network.getCookies();
    is(result.cookies.length, 0, "No secure cookies have been found");
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function expiry({ Network }) {
  const date = new Date();
  date.setDate(date.getDate() + 3);

  const encodedDate = encodeURI(date.toUTCString());
  await loadURL(`${DEFAULT_URL}?name=foo&value=bar&expiry=${encodedDate}`);

  const cookie = {
    name: "foo",
    value: "bar",
    expires: date,
    session: false,
  };

  try {
    const { cookies } = await Network.getCookies();
    is(cookies.length, 1, "A single cookie has been found");
    assertCookie(cookies[0], cookie);
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function session({ Network }) {
  await loadURL(`${DEFAULT_URL}?name=foo&value=bar`);

  const cookie = {
    name: "foo",
    value: "bar",
    expiry: -1,
    session: true,
  };

  try {
    const { cookies } = await Network.getCookies();
    is(cookies.length, 1, "A single cookie has been found");
    assertCookie(cookies[0], cookie);
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function path({ Network }) {
  const PATH = "/browser/remote/test/browser/";
  const PARENT_PATH = "/browser/remote/test/";

  await loadURL(`${DEFAULT_URL}?name=foo&value=bar&path=${PATH}`);

  const cookie = {
    name: "foo",
    value: "bar",
    path: PATH,
  };

  try {
    console.log("Check exact path");
    await loadURL(`${DEFAULT_HOST}${PATH}`);
    let result = await Network.getCookies();
    is(result.cookies.length, 1, "A single cookie has been found");
    assertCookie(result.cookies[0], cookie);

    console.log("Check sub path");
    await loadURL(`${DEFAULT_HOST}${SJS_PATH}`);
    result = await Network.getCookies();
    is(result.cookies.length, 1, "A single cookie has been found");
    assertCookie(result.cookies[0], cookie);

    console.log("Check parent path");
    await loadURL(`${DEFAULT_HOST}${PARENT_PATH}`);
    result = await Network.getCookies();
    is(result.cookies.length, 0, "No cookies have been found");

    console.log("Check non matching path");
    await loadURL(`${DEFAULT_HOST}/foo/bar`);
    result = await Network.getCookies();
    is(result.cookies.length, 0, "No cookies have been found");
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function httpOnly({ Network }) {
  await loadURL(`${DEFAULT_URL}?name=foo&value=bar&httpOnly`);

  const cookie = {
    name: "foo",
    value: "bar",
    httpOnly: true,
  };

  try {
    const { cookies } = await Network.getCookies();
    is(cookies.length, 1, "A single cookie has been found");
    assertCookie(cookies[0], cookie);
  } finally {
    Services.cookies.removeAll();
  }
});

add_task(async function sameSite({ Network }) {
  for (const value of ["Lax", "Strict"]) {
    console.log(`Test cookie with sameSite=${value}`);
    await loadURL(`${DEFAULT_URL}?name=foo&value=bar&sameSite=${value}`);

    const cookie = {
      name: "foo",
      value: "bar",
      sameSite: value,
    };

    try {
      const { cookies } = await Network.getCookies();
      is(cookies.length, 1, "A single cookie has been found");
      assertCookie(cookies[0], cookie);
    } finally {
      Services.cookies.removeAll();
    }
  }
});

function assertCookie(cookie, expected = {}) {
  const {
    name = "",
    value = "",
    domain = "example.org",
    path = "/",
    expires = -1,
    size = name.length + value.length,
    httpOnly = false,
    secure = false,
    session = true,
    sameSite,
  } = expected;

  const expectedCookie = {
    name,
    value,
    domain,
    path,
    // If expires is set, convert from milliseconds to seconds
    expires: expires > 0 ? Math.floor(expires.getTime() / 1000) : -1,
    size,
    httpOnly,
    secure,
    session,
  };

  if (sameSite) {
    expectedCookie.sameSite = sameSite;
  }

  Assert.deepEqual(cookie, expectedCookie);
}
