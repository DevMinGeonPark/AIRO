package com.heptivision.airo.core.network

import com.heptivision.airo.data.auth.AuthRepository

/** The caller only supplies app-relative paths; tokens never follow redirects. */
class AccountClient(val baseUrl: String, private val http: HttpTransport, private val auth: AuthRepository) {
    suspend fun request(path: String, method: String = "GET", body: String? = null): String {
        require(path.startsWith("/api/") && !path.contains(".."))
        val token = auth.accessToken()
        return try { http.request("$baseUrl$path", method, body, mapOf("Authorization" to "Bearer $token")) }
        catch (error: ApiException) {
            if (error.status != 401) throw error
            http.request("$baseUrl$path", method, body, mapOf("Authorization" to "Bearer ${auth.accessToken(token)}"))
        }
    }
}
