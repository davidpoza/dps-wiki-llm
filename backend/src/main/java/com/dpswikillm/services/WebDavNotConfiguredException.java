package com.dpswikillm.services;

/** Thrown when a WebDAV-only operation (e.g. Sync) is requested while WebDAV is disabled. */
public class WebDavNotConfiguredException extends RuntimeException {
    public WebDavNotConfiguredException() {
        super("WebDAV is not configured");
    }
}
