package com.dpswikillm.services;

/**
 * Thrown when a local write succeeded but replicating it to WebDAV failed. The local change and its
 * history entry are always kept; the controller surfaces this as a "saved locally, not replicated"
 * state.
 */
public class WebDavReplicationException extends RuntimeException {
    public WebDavReplicationException(String message, Throwable cause) {
        super(message, cause);
    }
}
