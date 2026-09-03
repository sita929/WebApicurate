/* ============================================================
   APIQurate control tables (Azure SQL Database)

   app.ApiConnections is the table the Data Factory pipeline reads.
   One row per user per API. It never holds a credential — only the
   name of the Key Vault secret the linked service should resolve.
   ============================================================ */

IF SCHEMA_ID('app') IS NULL
    EXEC('CREATE SCHEMA app');
GO

IF OBJECT_ID('app.ApiConnections', 'U') IS NULL
CREATE TABLE app.ApiConnections (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Username     NVARCHAR(100) NOT NULL,
    Provider     NVARCHAR(50)  NOT NULL,
    ApiName      NVARCHAR(100) NOT NULL CONSTRAINT DF_ApiConnections_ApiName DEFAULT '',
    DisplayName  NVARCHAR(100) NOT NULL,
    SecretName   NVARCHAR(200) NOT NULL,   -- e.g. hubspot--TestUserSuman
    BaseUrl      NVARCHAR(400) NOT NULL,
    Enabled      BIT           NOT NULL CONSTRAINT DF_ApiConnections_Enabled DEFAULT 1,
    VerifiedAt   DATETIME2     NULL,
    LastRunAt    DATETIME2     NULL,
    CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_ApiConnections_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ApiConnections_User_Api UNIQUE (Username, Provider, ApiName)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ApiConnections_Enabled')
CREATE INDEX IX_ApiConnections_Enabled
    ON app.ApiConnections (Enabled) INCLUDE (Username, Provider, SecretName, BaseUrl);
GO

/* The pipeline's Lookup activity runs exactly this. */
CREATE OR ALTER VIEW app.vw_ActiveConnections AS
    SELECT Username, Provider, ApiName, SecretName, BaseUrl
    FROM app.ApiConnections
    WHERE Enabled = 1;
GO
