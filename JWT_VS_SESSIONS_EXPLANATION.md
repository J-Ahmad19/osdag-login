# Understanding Stateful Sessions vs. Stateless JWTs

When building authentication systems, the two most common approaches are **Stateful Sessions** and **Stateless JWTs (JSON Web Tokens)**. Understanding the difference between them revolves around the concept of "State."

## 1. What does "State" mean?
In backend development, "State" simply means **memory**. 
* If a system is **Stateful**, the server has to "remember" who you are by looking you up in its database or memory every time you make a request.
* If a system is **Stateless**, the server treats every single request as completely brand new. It remembers absolutely nothing between your requests.

---

## 2. Stateful Sessions (Our Implementation)
In a traditional **Stateful Session**:
1. You log in successfully. 
2. The server creates a random, meaningless string of letters and numbers (e.g., `abc123xyz`). 
3. The server saves a record in its database (its "State"): *"Token `abc123xyz` belongs to user Alice, and it expires tomorrow."*
4. It hands that token to your browser.
5. When you ask the server for your private files, you hand the server the `abc123xyz` token. 
6. The server must query its database on every request to ask, *"Who does this token belong to? Is it still valid?"*

**Pros:** 
* **Highly Secure:** You can instantly log a user out or ban them by simply deleting their token from the database.
* **Granular Control:** You can see all active sessions for a user and revoke them individually (e.g., "Log out of all other devices").

**Cons:** 
* **Database Load:** The server has to do a database lookup on *every single authenticated request*, which can become a bottleneck if you have millions of active users.

---

## 3. Stateless JWTs (JSON Web Tokens)
To solve the performance problem of hitting the database on every request, engineers invented the **Stateless JWT**. A JWT is not a random string; it is a base64-encoded JSON object that physically contains your data, mathematically signed by the server so it cannot be tampered with.

If you decode a JWT, it looks like this: 
`{"userId": "usr_001", "email": "alice@example.com", "expires": "2026-08-10"}`

Here is how a **Stateless JWT** works:
1. You log in successfully.
2. The server creates the JWT containing your user ID and an expiration date. It cryptographically signs it with a secret key.
3. The server **does not save anything in its database**. It just hands the JWT to your browser.
4. When you ask for your private files, you hand the server the JWT. 
5. The server looks at the mathematical signature, verifies it hasn't been tampered with, and reads `"userId": "usr_001"` right out of the token itself. It **never checks the database** to verify your identity.

**Pros:** 
* **Extremely Fast and Scalable:** The server doesn't have to remember anything or query a database to authenticate the request (Stateless).

**Cons:** 
* **No True Logout:** You cannot easily log a user out! If a user clicks "Logout", their browser deletes the JWT. However, if a hacker copied that JWT 5 minutes ago, the hacker can keep using it until it expires. Because the server is truly stateless, it has no database to check to see if the user "logged out." It will just look at the hacker's token, see that the math checks out, and let the hacker in.

---

## 4. The "Hybrid" Approach (and why we avoided it)
Because of the inability to instantly invalidate compromised tokens (log users out), many modern applications issue a JWT, but they *also* save it in a database table (often called a "Deny List", "Allow List", or simply a "Session Table"). 

However, the moment you take a Stateless JWT and start looking it up in a database on every request to see if it was logged out, **it is no longer Stateless**. You have just reinvented a Stateful Session, but you are using a large, complicated JWT instead of a simple random string. 

### Conclusion for the Assignment
Because the assignment explicitly demanded true server-side logout (immediate invalidation), we bypassed JWTs entirely. We built a secure, traditional **Stateful Session** using a cryptographically secure random string and a PostgreSQL database table, ensuring that when `POST /logout` is called, the token is physically destroyed on the server.
